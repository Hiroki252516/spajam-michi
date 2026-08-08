import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import StarRating from '../components/StarRating';
import GradientButton from '../components/GradientButton';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS } from '../constants/design';
import { getEventById } from '../constants/dummyData';
import { useAuth } from '../context/AuthContext';

interface ReviewScreenProps {
  eventId: string;
  eventName: string;
  onReviewSubmitted: () => void;
  onGoBack: () => void;
}

const SATISFACTION_LABELS: Record<number, string> = {
  1: '😞 少し不満',
  2: '😐 普通',
  3: '🙂 満足',
  4: '😄 大満足',
  5: '🤩 最高！非常に良かった',
};

/**
 * ReviewScreen - 満足度記録・評価画面
 * 到着後に参加したイベントの満足度を記録する
 */
const ReviewScreen: React.FC<ReviewScreenProps> = ({
  eventId,
  onReviewSubmitted,
  onGoBack,
}) => {
  const event = getEventById(eventId);
  const { addVisitedEvent } = useAuth();
  const [rating, setRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('満足度を選択してください', '1つ以上の星を選択して満足度を記録してください');
      return;
    }

    setIsSubmitting(true);

    try {
      // 満足度を記録（ユーザープロフィールの参加履歴に保存）
      addVisitedEvent(event?.name || '体験イベント', rating);

      // ダミー遅延
      await new Promise<void>((resolve) => setTimeout(resolve, 600));

      Alert.alert('記録完了', 'イベントへの参加と満足度を記録しました！', [
        {
          text: 'OK',
          onPress: () => {
            setIsSubmitting(false);
            onReviewSubmitted();
          },
        },
      ]);
    } catch {
      Alert.alert('エラー', '記録に失敗しました。もう一度お試しください。');
      setIsSubmitting(false);
    }
  };

  if (!event) {
    return (
      <ScreenContainer>
        <Text style={styles.errorText}>イベント情報が見つかりません</Text>
      </ScreenContainer>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenContainer scrollable={true} keyboardAvoid={true} horizontalPadding={SPACING.base}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>満足度を記録</Text>
          <Text style={styles.subtitle}>参加したイベントの満足度を記録しましょう</Text>
        </View>

        {/* イベント情報 */}
        <View style={styles.eventSection}>
          <View style={styles.eventIconContainer}>
            <MaterialCommunityIcons
              name="calendar-check"
              size={32}
              color={COLORS.primary}
            />
          </View>
          <View style={styles.eventInfo}>
            <View style={styles.arrivedTag}>
              <MaterialCommunityIcons name="check-circle" size={12} color={COLORS.onPrimary} />
              <Text style={styles.arrivedTagText}>参加完了</Text>
            </View>
            <Text style={styles.eventName} numberOfLines={2}>
              {event.name}
            </Text>
            <Text style={styles.eventDate}>
              📍 {event.location} ({event.time})
            </Text>
          </View>
        </View>

        {/* 星評価セクション */}
        <View style={styles.ratingSection}>
          <Text style={styles.sectionTitle}>体験の満足度を星で評価</Text>
          <StarRating
            rating={rating}
            onRatingChange={setRating}
            size="lg"
            showLabel={false}
            style={styles.starRating}
          />
          <Text style={styles.ratingHint}>
            {rating === 0
              ? 'タップして満足度を選択してください'
              : SATISFACTION_LABELS[rating]}
          </Text>
        </View>

        {/* 投稿ボタン */}
        <View style={styles.buttonSection}>
          <GradientButton
            title={isSubmitting ? '記録中...' : '満足度を保存する'}
            onPress={handleSubmit}
            disabled={isSubmitting || rating === 0}
            size="lg"
            style={styles.submitButton}
          />
          <GradientButton
            title="戻る"
            onPress={onGoBack}
            disabled={isSubmitting}
            variant="secondary"
            size="md"
            style={styles.cancelButton}
          />
        </View>

        {/* 説明テキスト */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons
            name="information"
            size={16}
            color={COLORS.primary}
          />
          <Text style={styles.infoText}>
            記録された満足度はマイページに保存され、次回の目的地探しの参考になります。
          </Text>
        </View>
      </ScreenContainer>
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  title: {
    fontSize: TYPOGRAPHY.displaySm.fontSize,
    fontWeight: TYPOGRAPHY.displaySm.fontWeight,
    color: COLORS.ink,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.muted,
  },
  eventSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  eventIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventInfo: {
    flex: 1,
  },
  arrivedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.status.success,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  arrivedTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.onPrimary,
  },
  eventName: {
    fontSize: TYPOGRAPHY.titleSm.fontSize,
    fontWeight: '700',
    color: COLORS.ink,
    marginBottom: 2,
  },
  eventDate: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    color: COLORS.muted,
  },
  ratingSection: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.titleSm.fontSize,
    fontWeight: '600',
    color: COLORS.ink,
    marginBottom: SPACING.md,
  },
  starRating: {
    marginBottom: SPACING.sm,
  },
  ratingHint: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
  },
  buttonSection: {
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  submitButton: {
    width: '100%',
  },
  cancelButton: {
    width: '100%',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 56, 92, 0.08)',
    borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md,
    gap: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  infoText: {
    flex: 1,
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    color: COLORS.ink,
    lineHeight: 18,
  },
  errorText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.status.error,
    textAlign: 'center',
  },
});

export default ReviewScreen;
