import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Marker, type Region } from 'react-native-maps';
import ScreenContainer from '../components/ScreenContainer';
import CardComponent from '../components/CardComponent';
import LocationMarker from '../components/LocationMarker';
import GradientButton from '../components/GradientButton';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/design';
import { revealEvent } from '../services/api';
import type { EventData, RevealedEvent } from '../services/api';

interface GuideScreenProps {
  event: EventData;
  token: string;
  onArrived: (event: RevealedEvent) => void;
  onGoBack: () => void;
}

const ARRIVAL_THRESHOLD_METERS = 100;

function distanceFromEvent(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = ((second.latitude - first.latitude) * Math.PI) / 180;
  const longitudeDelta = ((second.longitude - first.longitude) * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos((first.latitude * Math.PI) / 180) *
      Math.cos((second.latitude * Math.PI) / 180) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function createRegion(
  current: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Region {
  return {
    latitude: (current.latitude + destination.latitude) / 2,
    longitude: (current.longitude + destination.longitude) / 2,
    latitudeDelta: Math.max(Math.abs(current.latitude - destination.latitude) * 1.5, 0.01),
    longitudeDelta: Math.max(Math.abs(current.longitude - destination.longitude) * 1.5, 0.01),
  };
}

/**
 * GuideScreen - GPS基盤ナビゲーション画面
 * 目的地に到着するとイベント詳細が開放され、参加と満足度の記録へ進む
 */
const GuideScreen: React.FC<GuideScreenProps> = ({
  event,
  token,
  onArrived,
  onGoBack,
}) => {
  const [userLocation, setUserLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [distance, setDistance] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [revealedEvent, setRevealedEvent] = useState<RevealedEvent | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const revealAttempted = useRef(false);
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const hasFittedMap = useRef(false);

  const requestReveal = useCallback(async (coordinates: Location.LocationObjectCoords) => {
    if (!token || !event.coordinates || revealAttempted.current || distanceFromEvent(coordinates, event.coordinates) > ARRIVAL_THRESHOLD_METERS) {
      return;
    }

    revealAttempted.current = true;
    setIsRevealing(true);
    setRevealError(null);
    try {
      const details = await revealEvent(event.id, token, {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      });
      setRevealedEvent(details);
    } catch (error) {
      setRevealError(error instanceof Error ? error.message : '到着を確認できませんでした。');
    } finally {
      setIsRevealing(false);
    }
  }, [event.coordinates, event.id, token]);

  useEffect(() => {
    let isActive = true;
    let subscription: Location.LocationSubscription | undefined;

    const updateLocation = (coordinates: Location.LocationObjectCoords) => {
      if (!isActive) return;
      setUserLocation(coordinates);
      if (event.coordinates) {
        const currentDistance = distanceFromEvent(coordinates, event.coordinates);
        setDistance(currentDistance);
        if (currentDistance <= ARRIVAL_THRESHOLD_METERS) void requestReveal(coordinates);
      }
    };

    const startLocationUpdates = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        throw new Error('ナビゲーションには位置情報の許可が必要です。');
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        throw new Error('iPhoneの位置情報サービスを有効にしてください。');
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      updateLocation(current.coords);
      setIsLoading(false);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 3_000,
        },
        (position) => updateLocation(position.coords),
      );
      if (!isActive) subscription.remove();
    };

    void startLocationUpdates().catch((error: unknown) => {
      if (!isActive) return;
      setLocationError(error instanceof Error ? error.message : '現在地を取得できませんでした。');
      setIsLoading(false);
    });

    return () => {
      isActive = false;
      subscription?.remove();
    };
  }, [event.coordinates, requestReveal]);

  useEffect(() => {
    if (!mapReady || !userLocation || !event.coordinates || hasFittedMap.current) return;
    hasFittedMap.current = true;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        [
          { latitude: userLocation.latitude, longitude: userLocation.longitude },
          event.coordinates!,
        ],
        {
          edgePadding: { top: 110, right: 36, bottom: 360, left: 36 },
          animated: true,
        },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [event.coordinates, mapReady, userLocation]);

  const retryArrivalCheck = () => {
    if (!userLocation) return;
    revealAttempted.current = false;
    void requestReveal(userLocation);
  };

  const initialRegion: Region | undefined = userLocation && event.coordinates
    ? createRegion(userLocation, event.coordinates)
    : undefined;

  if (!event.coordinates) {
    return (
      <ScreenContainer>
        <Text style={styles.errorText}>目的地の座標を取得できませんでした</Text>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>地図を読み込み中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!userLocation) {
    return (
      <ScreenContainer>
        <Text style={styles.errorText}>{locationError ?? '現在地を取得できませんでした。'}</Text>
        <Pressable style={styles.retryButton} onPress={onGoBack}>
          <Text style={styles.retryButtonText}>イベント一覧へ戻る</Text>
        </Pressable>
      </ScreenContainer>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background.primary} />
      <View style={styles.container}>
        {/* 地図 */}
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation={true}
          onMapReady={() => setMapReady(true)}
        >
          {/* イベント位置マーカー */}
          <Marker
            coordinate={{
              latitude: event.coordinates.latitude,
              longitude: event.coordinates.longitude,
            }}
            title={revealedEvent?.name ?? event.spotName ?? '目的地スポット'}
          >
            <LocationMarker isArrived={Boolean(revealedEvent)} size="md" />
          </Marker>
        </MapView>

        {/* 戻るボタン（左上） */}
        <Pressable style={styles.backButton} onPress={onGoBack}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={24}
            color={COLORS.onPrimary}
          />
        </Pressable>

        {/* イベント情報パネル（下部） */}
        <View style={styles.infoPanel}>
          <CardComponent blurred={true} padding={SPACING.md}>
            {/* 到着前後のタイトル */}
            {revealedEvent ? (
              <View style={styles.unlockedHeader}>
                <View style={styles.unlockedBadge}>
                  <MaterialCommunityIcons name="party-popper" size={16} color={COLORS.onPrimary} />
                  <Text style={styles.unlockedBadgeText}>イベント解放！</Text>
                </View>
                <Text style={styles.revealedEventName}>{revealedEvent.name}</Text>
                <Text style={styles.eventDescription}>
                  {revealedEvent.detailedDescription || revealedEvent.description}
                </Text>
              </View>
            ) : (
              <View style={styles.mysteryHeader}>
                <View style={styles.spotTag}>
                  <MaterialCommunityIcons name="map-marker-radius" size={16} color={COLORS.primary} />
                  <Text style={styles.spotTagText}>{event.spotName || '目的地スポット'}</Text>
                </View>
                <Text style={styles.maskedTitle}>🔒 到着するとイベントが判明します</Text>
              </View>
            )}

            {/* 距離・状態 */}
            {distance !== null && (
              <View style={styles.statusRow}>
                <MaterialCommunityIcons
                  name="navigation"
                  size={18}
                  color={COLORS.primary}
                />
                <Text style={styles.distanceText}>
                  目的地まで {distance < 1000
                    ? `${Math.round(distance)} m`
                    : `${(distance / 1000).toFixed(1)} km`}
                </Text>
              </View>
            )}

            {/* 到着状態 */}
            {revealedEvent ? (
              <View style={styles.arrivedSection}>
                <MaterialCommunityIcons
                  name="check-circle"
                  size={22}
                  color={COLORS.status.success}
                />
                <Text style={styles.arrivedText}>目的地に到着！イベント開催中です 🎉</Text>
              </View>
            ) : (
              <View style={styles.guidingRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.guidingText}>
                  {isRevealing
                    ? '到着地点を確認しています...'
                    : revealError ?? '目的地に向かっています...'}
                </Text>
                {revealError && (
                  <Pressable onPress={retryArrivalCheck}>
                    <Text style={styles.retryButtonText}>再確認</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* 詳細5大条件 */}
            <View style={styles.detailsGrid}>
              <View style={styles.detailChip}>
                <MaterialCommunityIcons name="clock-outline" size={14} color={COLORS.muted} />
                <Text style={styles.chipText}>{event.time}</Text>
              </View>
              <View style={styles.detailChip}>
                <MaterialCommunityIcons name="timer-outline" size={14} color={COLORS.muted} />
                <Text style={styles.chipText}>{event.duration || '約60分'}</Text>
              </View>
              <View style={styles.detailChip}>
                <MaterialCommunityIcons name="currency-jpy" size={14} color={COLORS.primary} />
                <Text style={styles.chipTextBold}>{event.cost || '無料'}</Text>
              </View>
              <View style={styles.detailChipFull}>
                <MaterialCommunityIcons name="map-marker-outline" size={14} color={COLORS.muted} />
                <Text style={styles.chipText} numberOfLines={1}>{event.location}</Text>
              </View>
            </View>

            {/* 満足度記録へ進むボタン（到着後） */}
            {revealedEvent && (
              <GradientButton
                title="イベントに参加して満足度を記録する"
                onPress={() => onArrived(revealedEvent)}
                size="md"
                style={styles.reviewButton}
              />
            )}
          </CardComponent>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  map: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 48,
    left: SPACING.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  infoPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
  },
  mysteryHeader: {
    marginBottom: SPACING.sm,
  },
  spotTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  spotTagText: {
    fontSize: TYPOGRAPHY.titleSm.fontSize,
    fontWeight: '700',
    color: COLORS.ink,
  },
  maskedTitle: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    color: COLORS.primary,
    fontWeight: '600',
  },
  unlockedHeader: {
    marginBottom: SPACING.sm,
  },
  unlockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: 4,
  },
  unlockedBadgeText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    fontWeight: '700',
    color: COLORS.onPrimary,
  },
  revealedEventName: {
    fontSize: TYPOGRAPHY.displaySm.fontSize,
    fontWeight: TYPOGRAPHY.displaySm.fontWeight,
    color: COLORS.ink,
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.body,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  distanceText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '700',
    color: COLORS.primary,
  },
  arrivedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.xs,
  },
  arrivedText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    fontWeight: '700',
    color: COLORS.status.success,
  },
  guidingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  guidingText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    color: COLORS.muted,
    fontStyle: 'italic',
    flex: 1,
  },
  retryButton: {
    alignSelf: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {
    color: COLORS.onPrimary,
    fontWeight: '700',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: SPACING.xs,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  detailChipFull: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    width: '100%',
  },
  chipText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    color: COLORS.ink,
  },
  chipTextBold: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    fontWeight: '700',
    color: COLORS.primary,
  },
  reviewButton: {
    marginTop: SPACING.sm,
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.muted,
  },
  errorText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.status.error,
    textAlign: 'center',
  },
});

export default GuideScreen;
