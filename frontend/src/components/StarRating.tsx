import React from 'react';
import { View, Pressable, StyleSheet, ViewStyle, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, SIZES, TYPOGRAPHY } from '../constants/design';

interface StarRatingProps {
  rating: number;
  onRatingChange: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
  style?: ViewStyle;
  showLabel?: boolean;
}

/**
 * 星評価コンポーネント
 * test_modelのイベント評価画面用
 */
const StarRating: React.FC<StarRatingProps> = ({
  rating,
  onRatingChange,
  size = 'md',
  readonly = false,
  style,
  showLabel = true,
}) => {
  const starSize = size === 'sm' ? SIZES.icon.md : size === 'lg' ? SIZES.icon.xl : SIZES.icon.lg;
  const spacing = size === 'sm' ? SPACING.sm : SPACING.md;

  const handleStarPress = (index: number) => {
    if (!readonly) {
      onRatingChange(index + 1);
    }
  };

  return (
    <View style={style}>
      <View style={[styles.container, { gap: spacing }]}>
        {[0, 1, 2, 3, 4].map((index) => (
          <Pressable
            key={index}
            onPress={() => handleStarPress(index)}
            disabled={readonly}
            style={({ pressed }) => [
              styles.starButton,
              pressed && !readonly && { opacity: 0.7 },
            ]}
          >
            <MaterialCommunityIcons
              name={index < rating ? 'star' : 'star-outline'}
              size={starSize}
              color={index < rating ? COLORS.star.filled : COLORS.star.empty}
            />
          </Pressable>
        ))}
      </View>
      {showLabel && (
        <Text style={styles.label}>
          {rating > 0 ? `${rating}つ星` : '評価を選択してください'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  starButton: {
    padding: SPACING.sm,
  },
  label: {
    marginTop: SPACING.md,
    textAlign: 'center',
    fontSize: TYPOGRAPHY.body.small.size,
    color: COLORS.text.secondary,
  },
});

export default StarRating;
