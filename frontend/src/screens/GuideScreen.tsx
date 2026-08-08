import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import ScreenContainer from '../components/ScreenContainer';
import CardComponent from '../components/CardComponent';
import LocationMarker from '../components/LocationMarker';
import GradientButton from '../components/GradientButton';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/design';
import { getEventById } from '../constants/dummyData';

interface GuideScreenProps {
  eventId: string;
  eventName: string;
  onArrived: () => void;
  onGoBack: () => void;
}

/**
 * GuideScreen - GPS基盤ナビゲーション画面
 * 目的地に到着するとイベント詳細が開放され、参加と満足度の記録へ進む
 */
const GuideScreen: React.FC<GuideScreenProps> = ({
  eventId,
  onArrived,
  onGoBack,
}) => {
  const event = getEventById(eventId);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [userLocation, setUserLocation] = useState({
    latitude: 35.6595, // デフォルト位置（東京渋谷）
    longitude: 139.7004,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  const [isArrived, setIsArrived] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [distance, setDistance] = useState<number | null>(null);

  const ARRIVAL_THRESHOLD = 100; // メートル単位での到着判定距離

  /**
   * 2つの座標間の距離を計算（Haversine公式）
   */
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    setIsLoading(false);

    const interval = setInterval(() => {
      if (event) {
        const dist = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          event.coordinates.latitude,
          event.coordinates.longitude
        );
        setDistance(dist);

        if (dist < ARRIVAL_THRESHOLD && !isArrived) {
          setIsArrived(true);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [event, userLocation, isArrived]);

  if (!event) {
    return (
      <ScreenContainer>
        <Text style={styles.errorText}>目的地情報が見つかりません</Text>
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

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background.primary} />
      <View style={styles.container}>
        {/* 地図 */}
        <MapView
          style={styles.map}
          initialRegion={userLocation}
          showsUserLocation={true}
        >
          {/* イベント位置マーカー */}
          <Marker
            coordinate={{
              latitude: event.coordinates.latitude,
              longitude: event.coordinates.longitude,
            }}
            title={isArrived ? event.name : (event.spotName || '目的地スポット')}
          >
            <LocationMarker isArrived={isArrived} size="md" />
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
            {isArrived ? (
              <View style={styles.unlockedHeader}>
                <View style={styles.unlockedBadge}>
                  <MaterialCommunityIcons name="party-popper" size={16} color={COLORS.onPrimary} />
                  <Text style={styles.unlockedBadgeText}>イベント解放！</Text>
                </View>
                <Text style={styles.revealedEventName}>{event.name}</Text>
                <Text style={styles.eventDescription}>{event.description}</Text>
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
            {isArrived ? (
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
                <Text style={styles.guidingText}>目的地に向かっています...</Text>
                <Pressable
                  style={styles.simArrivalButton}
                  onPress={() => setIsArrived(true)}
                >
                  <Text style={styles.simArrivalText}>[テスト:到着]</Text>
                </Pressable>
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
            {isArrived && (
              <GradientButton
                title="イベントに参加して満足度を記録する"
                onPress={onArrived}
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
  simArrivalButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: COLORS.surfaceStrong,
    borderRadius: BORDER_RADIUS.sm,
  },
  simArrivalText: {
    fontSize: 11,
    color: COLORS.muted,
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
