import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/design';

interface LocationMarkerProps {
  size?: 'sm' | 'md' | 'lg';
  isArrived?: boolean;
  style?: ViewStyle;
}

/**
 * ロケーションマーカーコンポーネント
 * test_modelのGuideScreen地図用
 */
const LocationMarker: React.FC<LocationMarkerProps> = ({
  size = 'md',
  isArrived = false,
  style,
}) => {
  const iconSize = size === 'sm' ? SIZES.icon.md : size === 'lg' ? SIZES.icon.xl : SIZES.icon.lg;
  const markerSize = size === 'sm' ? 36 : size === 'lg' ? 56 : 44;

  return (
    <View
      style={[
        styles.container,
        {
          width: markerSize,
          height: markerSize,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.marker,
          {
            width: markerSize,
            height: markerSize,
            borderRadius: markerSize / 2,
          },
          isArrived && styles.markerArrived,
        ]}
      >
        <MaterialCommunityIcons
          name="navigation"
          size={iconSize * 0.6}
          color={COLORS.text.white}
          style={styles.icon}
        />
      </View>

      {/* 現在地ハロー（オプション） */}
      {!isArrived && (
        <View
          style={[
            styles.halo,
            {
              width: markerSize + 12,
              height: markerSize + 12,
              borderRadius: (markerSize + 12) / 2,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  marker: {
    backgroundColor: COLORS.gradient.start,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  markerArrived: {
    backgroundColor: COLORS.status.success,
  },
  icon: {
    transform: [{ rotate: '-45deg' }],
  },
  halo: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.gradient.start,
    opacity: 0.3,
  },
});

export default LocationMarker;
