import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CardComponent from './CardComponent';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/design';

export interface EventCardData {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  distance?: string;
  imageUri?: string;
  rating?: number;
}

interface EventCardProps {
  event: EventCardData;
  onPress: () => void;
  style?: ViewStyle;
}

/**
 * イベント情報カードコンポーネント
 * test_modelの検索結果一覧用
 */
const EventCard: React.FC<EventCardProps> = ({ event, onPress, style }) => {
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
          {/* イベント画像 */}
          {event.imageUri && (
            <Image
              source={{ uri: event.imageUri }}
              style={styles.image}
            />
          )}

          {/* イベント情報 */}
          <View style={styles.infoSection}>
            {/* タイトル */}
            <Text
              style={styles.eventName}
              numberOfLines={2}
            >
              {event.name}
            </Text>

            {/* 日時・場所 */}
            <View style={styles.detailsRow}>
              <MaterialCommunityIcons
                name="calendar"
                size={16}
                color={COLORS.text.secondary}
              />
              <Text style={styles.detailText}>
                {event.date} {event.time}
              </Text>
            </View>

            <View style={styles.detailsRow}>
              <MaterialCommunityIcons
                name="map-marker"
                size={16}
                color={COLORS.text.secondary}
              />
              <Text style={styles.detailText}>
                {event.location}
              </Text>
            </View>

            {/* 距離 */}
            {event.distance && (
              <View style={styles.distanceRow}>
                <MaterialCommunityIcons
                  name="navigation"
                  size={16}
                  color={COLORS.gradient.start}
                />
                <Text style={styles.distanceText}>
                  {event.distance}
                </Text>
              </View>
            )}

            {/* 評価 */}
            {event.rating !== undefined && event.rating > 0 && (
              <View style={styles.ratingRow}>
                <MaterialCommunityIcons
                  name="star"
                  size={16}
                  color={COLORS.star.filled}
                />
                <Text style={styles.ratingText}>
                  {event.rating.toFixed(1)}
                </Text>
              </View>
            )}
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
    opacity: 0.8,
  },
  cardContent: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 150,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
  },
  infoSection: {
    padding: SPACING.md,
  },
  eventName: {
    fontSize: TYPOGRAPHY.body.large.size,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
    lineHeight: TYPOGRAPHY.body.large.lineHeight,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  detailText: {
    fontSize: TYPOGRAPHY.body.small.size,
    color: COLORS.text.secondary,
    flex: 1,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  distanceText: {
    fontSize: TYPOGRAPHY.body.medium.size,
    fontWeight: '500',
    color: COLORS.gradient.start,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  ratingText: {
    fontSize: TYPOGRAPHY.body.small.size,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
});

export default EventCard;
