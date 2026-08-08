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
import TextInputField from '../components/TextInputField';
import GradientButton from '../components/GradientButton';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/design';
import { getEventById } from '../constants/dummyData';

interface ReviewScreenProps {
  eventId: string;
  eventName: string;
  onReviewSubmitted: () => void;
  onGoBack: () => void;
}

/**
 * ReviewScreen - 星評価・レビュー投稿画面
 * test_modelのイベント評価画面を再現
 */
const ReviewScreen: React.FC<ReviewScreenProps> = ({
  eventId,
  onReviewSubmitted,
  onGoBack,
}) => {
  const event = getEventById(eventId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('評価を選択してください', '1つ以上の星を選択してください');
      return;
    }

    setIsSubmitting(true);

    // API呼び出しをシミュレート
    try {
      // 実際には以下のようなAPI呼び出しを実装
      // await api.post('/reviews', {
      //   eventId,
      //   rating,
      //   comment,
      //   timestamp: new Date().toISOString(),
      // });

      // ダミー遅延
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));

      Alert.alert('投稿完了', 'レビューを投稿しました', [
        {
          text: 'OK',
          onPress: () => {
            setIsSubmitting(false);
            onReviewSubmitted();
          },
        },
      ]);
    } catch {
      Alert.alert('エラー', '投稿に失敗しました。もう一度お試しください。');
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
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background.primary} />
      <ScreenContainer scrollable={true} keyboardAvoid={true}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>イベント評価</Text>
          <Text style={styles.subtitle}>あなたの感想をお聞かせください</Text>
        </View>

        {/* イベント情報 */}
        <View style={styles.eventSection}>
          <View style={styles.eventIconContainer}>
            <MaterialCommunityIcons
              name="calendar-check"
              size={32}
              color={COLORS.gradient.start}
            />
          </View>
          <View style={styles.eventInfo}>
            <Text style={styles.eventName} numberOfLines={2}>
              {event.name}
            </Text>
            <Text style={styles.eventDate}>
              {event.date} {event.time}
            </Text>
          </View>
        </View>

        {/* 星評価セクション */}
        <View style={styles.ratingSection}>
          <Text style={styles.sectionTitle}>評価してください</Text>
          <StarRating
            rating={rating}
            onRatingChange={setRating}
            size="lg"
            showLabel={true}
            style={styles.starRating}
          />
          <Text style={styles.ratingHint}>
            {rating === 0
              ? '5段階で評価してください'
              : `${rating}つ星です`}
          </Text>
        </View>

        {/* コメントセクション */}
        <View style={styles.commentSection}>
          <Text style={styles.sectionTitle}>コメント（任意）</Text>
          <TextInputField
            placeholder="イベントの感想をお聞かせください..."
            value={comment}
            onChangeText={setComment}
            multiline={true}
            numberOfLines={4}
            containerStyle={styles.commentInput}
          />
          <Text style={styles.commentHint}>
            {comment.length} / 500 文字
          </Text>
        </View>

        {/* 投稿ボタン */}
        <View style={styles.buttonSection}>
          <GradientButton
            title={isSubmitting ? '投稿中...' : '投稿する'}
            onPress={handleSubmit}
            disabled={isSubmitting || rating === 0}
            size="lg"
            style={styles.submitButton}
          />
          <GradientButton
            title="キャンセル"
            onPress={onGoBack}
            disabled={isSubmitting}
            size="md"
            style={styles.cancelButton}
          />
        </View>

        {/* 説明テキスト */}
        <View style={styles.infoBox}>
          <MaterialCommunityIcons
            name="information"
            size={16}
            color={COLORS.status.info}
          />
          <Text style={styles.infoText}>
            あなたのレビューは他のユーザーの参考になります。
            公開可能な情報のみをお記入ください。
          </Text>
        </View>
      </ScreenContainer>
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: TYPOGRAPHY.heading.size,
    fontWeight: TYPOGRAPHY.heading.weight,
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.body.small.size,
    color: COLORS.text.secondary,
  },
  eventSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background.secondary,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  eventIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: TYPOGRAPHY.body.medium.size,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.xs,
    lineHeight: TYPOGRAPHY.body.medium.lineHeight,
  },
  eventDate: {
    fontSize: TYPOGRAPHY.body.small.size,
    color: COLORS.text.secondary,
  },
  ratingSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.body.large.size,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
  },
  starRating: {
    marginBottom: SPACING.md,
  },
  ratingHint: {
    fontSize: TYPOGRAPHY.caption.size,
    color: COLORS.text.tertiary,
    textAlign: 'center',
  },
  commentSection: {
    marginBottom: SPACING.lg,
  },
  commentInput: {
    marginBottom: SPACING.sm,
  },
  commentHint: {
    fontSize: TYPOGRAPHY.caption.size,
    color: COLORS.text.tertiary,
    textAlign: 'right',
  },
  buttonSection: {
    gap: SPACING.md,
    marginBottom: SPACING.lg,
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
    backgroundColor: `rgba(59, 130, 246, 0.1)`,
    borderRadius: 8,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  infoText: {
    flex: 1,
    fontSize: TYPOGRAPHY.body.small.size,
    color: COLORS.status.info,
    lineHeight: 18,
  },
  errorText: {
    fontSize: TYPOGRAPHY.body.medium.size,
    color: COLORS.status.error,
    textAlign: 'center',
  },
});

export default ReviewScreen;
