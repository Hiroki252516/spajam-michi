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
 * test_modelのナビゲーション画面を再現
 */
const GuideScreen: React.FC<GuideScreenProps> = ({
  eventId,
  onArrived,
  onGoBack,
}) => {
  const event = getEventById(eventId);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [userLocation, setUserLocation] = useState({
    latitude: 35.6595,  // デフォルト位置（東京渋谷）
    longitude: 139.7004,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  // Note: setUserLocation は実装予定だがローカル状態でのみ使用
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
    const R = 6371000; // 地球の半径（メートル）
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
    // GPS位置情報を取得（ダミー実装）
    // 実際には expo-location を使用
    setIsLoading(false);

    // 定期的に距離を更新
    const interval = setInterval(() => {
      if (event) {
        const dist = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          event.coordinates.latitude,
          event.coordinates.longitude
        );
        setDistance(dist);

        // 到着判定
        if (dist < ARRIVAL_THRESHOLD && !isArrived) {
          setIsArrived(true);
          onArrived();
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [event, userLocation, isArrived, onArrived]);

  if (!event) {
    return (
      <ScreenContainer>
        <Text style={styles.errorText}>イベント情報が見つかりません</Text>
      </ScreenContainer>
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.gradient.start} />
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
            title={isArrived ? event.name : '?'}
          >
            <LocationMarker isArrived={isArrived} size="md" />
          </Marker>
        </MapView>

        {/* 戻るボタン（左上） */}
        <Pressable style={styles.backButton} onPress={onGoBack}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={24}
            color={COLORS.text.white}
          />
        </Pressable>

        {/* イベント情報パネル（下部） */}
        <View style={styles.infoPanel}>
          <CardComponent blurred={true} padding={SPACING.md}>
            {/* イベント名または「?」 */}
            <Text style={styles.eventNameOrMask}>
              {isArrived ? event.name : '?'}
            </Text>

            {/* 距離・状態 */}
            {distance !== null && (
              <View style={styles.statusRow}>
                <MaterialCommunityIcons
                  name="navigation"
                  size={18}
                  color={COLORS.gradient.start}
                />
                <Text style={styles.distanceText}>
                  {distance < 1000
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
                  size={20}
                  color={COLORS.status.success}
                />
                <Text style={styles.arrivedText}>到着しました！</Text>
              </View>
            ) : (
              <Text style={styles.guidingText}>目的地に向かっています...</Text>
            )}

            {/* 詳細情報 */}
            <View style={styles.detailsSection}>
              <View style={styles.detailRow}>
                <MaterialCommunityIcons
                  name="calendar"
                  size={16}
                  color={COLORS.text.secondary}
                />
                <Text style={styles.detailText}>
                  {event.date} {event.time}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <MaterialCommunityIcons
                  name="map-marker"
                  size={16}
                  color={COLORS.text.secondary}
                />
                <Text style={styles.detailText}>{event.location}</Text>
              </View>
            </View>

            {/* 評価へ進むボタン（到着後のみ） */}
            {isArrived && (
              <GradientButton
                title="イベントを評価する"
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
    backgroundColor: COLORS.gradient.start,
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
  eventNameOrMask: {
    fontSize: TYPOGRAPHY.heading.size,
    fontWeight: TYPOGRAPHY.heading.weight,
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  distanceText: {
    fontSize: TYPOGRAPHY.body.large.size,
    fontWeight: '600',
    color: COLORS.gradient.start,
  },
  arrivedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  arrivedText: {
    fontSize: TYPOGRAPHY.body.medium.size,
    fontWeight: '600',
    color: COLORS.status.success,
  },
  guidingText: {
    fontSize: TYPOGRAPHY.body.small.size,
    color: COLORS.text.secondary,
    marginBottom: SPACING.md,
    fontStyle: 'italic',
  },
  detailsSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.card.border,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  detailText: {
    fontSize: TYPOGRAPHY.body.small.size,
    color: COLORS.text.secondary,
    flex: 1,
  },
  reviewButton: {
    marginTop: SPACING.lg,
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: TYPOGRAPHY.body.medium.size,
    color: COLORS.text.secondary,
  },
  errorText: {
    fontSize: TYPOGRAPHY.body.medium.size,
    color: COLORS.status.error,
    textAlign: 'center',
  },
});

export default GuideScreen;
