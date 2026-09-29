import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import CardComponent from './CardComponent';
import LocationMarker from './LocationMarker';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/design';

export interface EventCardData {
  id: string;
  name?: string;
  spotName?: string;
  date: string;
  time: string;
  duration?: string;
  cost?: string;
  location: string;
  distance?: string;
  imageUri?: string | null;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

interface EventCardProps {
  event: EventCardData;
  onPress: () => void;
  style?: ViewStyle;
}

/**
 * EventCard - 目的地・条件ベースのカードコンポーネント
 * 開催場所周辺の地図、開催時間・所要時間・必要な金額・場所・距離を分かりやすく表示
 */
const EventCard: React.FC<EventCardProps> = ({ event, onPress, style }) => {
  const displayTitle = event.spotName || `目的地 (${event.location})`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        style,
      ]}
    >
      <CardComponent blurred={true} padding={0}>
        <View style={styles.cardContent}>
          {/* 開催場所周辺の地図表示エリア */}
          <View style={styles.mapWrapper} pointerEvents="none">
            {event.coordinates ? (
              <MapView
                style={styles.map}
                initialRegion={{
                  latitude: event.coordinates.latitude,
                  longitude: event.coordinates.longitude,
                  latitudeDelta: 0.008,
                  longitudeDelta: 0.008,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                <Marker
                  coordinate={event.coordinates}
                  title={displayTitle}
                >
                  <LocationMarker isArrived={false} size="sm" />
                </Marker>
              </MapView>
            ) : (
              <View style={styles.mapFallback}>
                <Text style={styles.mapFallbackText}>地図の座標を取得できませんでした</Text>
              </View>
            )}
            <View style={styles.mapBadge}>
              <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.primary} />
              <Text style={styles.mapBadgeText}>開催場所周辺マップ</Text>
            </View>
          </View>

          {/* メイン情報セクション */}
          <View style={styles.infoSection}>
            {/* 行き先・スポット名 */}
            <View style={styles.titleRow}>
              <Text style={styles.spotTitle} numberOfLines={1}>
                {displayTitle}
              </Text>
            </View>

            {/* 5大条件エリア (開催時間・所要時間・必要な金額・場所・距離) */}
            <View style={styles.detailsGrid}>
              {/* 1. 開催時間 */}
              <View style={styles.gridItem}>
                <MaterialCommunityIcons name="clock-outline" size={16} color={COLORS.primary} />
                <View style={styles.textContainer}>
                  <Text style={styles.label}>開催時間</Text>
                  <Text style={styles.valueText}>{event.time}</Text>
                </View>
              </View>

              {/* 2. 所要時間 */}
              <View style={styles.gridItem}>
                <MaterialCommunityIcons name="timer-outline" size={16} color={COLORS.primary} />
                <View style={styles.textContainer}>
                  <Text style={styles.label}>所要時間</Text>
                  <Text style={styles.valueText}>{event.duration || '約60分'}</Text>
                </View>
              </View>

              {/* 3. 必要な金額 */}
              <View style={styles.gridItem}>
                <MaterialCommunityIcons name="currency-jpy" size={16} color={COLORS.primary} />
                <View style={styles.textContainer}>
                  <Text style={styles.label}>必要な金額</Text>
                  <Text style={styles.valueHighlight}>{event.cost || '無料'}</Text>
                </View>
              </View>

              {/* 4. 場所 */}
              <View style={styles.gridItemFull}>
                <MaterialCommunityIcons name="map-marker-outline" size={16} color={COLORS.primary} />
                <View style={styles.textContainer}>
                  <Text style={styles.label}>場所</Text>
                  <Text style={styles.valueText} numberOfLines={1}>{event.location}</Text>
                </View>
              </View>

              {/* 5. 距離 */}
              {event.distance && (
                <View style={styles.gridItemFull}>
                  <MaterialCommunityIcons name="navigation-outline" size={16} color={COLORS.primary} />
                  <View style={styles.textContainer}>
                    <Text style={styles.label}>距離</Text>
                    <Text style={styles.distanceText}>{event.distance}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </CardComponent>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  cardContent: {
    overflow: 'hidden',
    borderRadius: BORDER_RADIUS.md,
  },
  mapWrapper: {
    position: 'relative',
    width: '100%',
    height: 140,
    backgroundColor: COLORS.surfaceSoft,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapFallbackText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    color: COLORS.muted,
  },
  mapBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    ...SHADOWS.sm,
  },
  mapBadgeText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    fontWeight: '700',
    color: COLORS.ink,
  },
  infoSection: {
    padding: SPACING.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  spotTitle: {
    fontSize: TYPOGRAPHY.titleSm.fontSize,
    fontWeight: '700',
    color: COLORS.ink,
    flex: 1,
    marginRight: SPACING.xs,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceSoft,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  gridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    gap: 6,
    paddingVertical: 2,
  },
  gridItemFull: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 6,
    paddingVertical: 2,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.muted,
    textTransform: 'uppercase',
  },
  valueText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    fontWeight: '600',
    color: COLORS.ink,
  },
  valueHighlight: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    fontWeight: '700',
    color: COLORS.primary,
  },
  distanceText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    fontWeight: '700',
    color: COLORS.primary,
  },
});

export default EventCard;
