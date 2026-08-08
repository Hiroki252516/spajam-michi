import React from 'react';
import {
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, SIZES, SHADOWS } from '../constants/design';

interface TextInputFieldProps extends RNTextInputProps {
  placeholder?: string;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

/**
 * テキスト入力フィールドコンポーネント
 * test_modelの検索フォーム・入力欄用
 */
const TextInputField: React.FC<TextInputFieldProps> = ({
  placeholder,
  containerStyle,
  inputStyle,
  label,
  error,
  icon,
  ...props
}) => {
  return (
    <View style={containerStyle}>
      {label && (
        <Text style={styles.label}>
          {label}
        </Text>
      )}
      <View style={[styles.inputContainer, error && styles.inputContainerError]}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <RNTextInput
          placeholder={placeholder}
          placeholderTextColor={COLORS.text.tertiary}
          style={[
            styles.input,
            icon && styles.inputWithIcon,
            inputStyle,
          ]}
          {...props}
        />
      </View>
      {error && (
        <Text style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: TYPOGRAPHY.label.size,
    fontWeight: TYPOGRAPHY.label.weight,
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: SIZES.input.height,
    borderRadius: SIZES.input.borderRadius,
    backgroundColor: COLORS.card.background,
    borderWidth: 1,
    borderColor: COLORS.card.border,
    paddingHorizontal: SPACING.md,
    ...SHADOWS.sm,
  },
  inputContainerError: {
    borderColor: COLORS.status.error,
  },
  input: {
    flex: 1,
    fontSize: TYPOGRAPHY.body.medium.size,
    color: COLORS.text.primary,
    padding: 0,
  },
  inputWithIcon: {
    marginLeft: SPACING.sm,
  },
  iconContainer: {
    marginRight: SPACING.sm,
  },
  errorText: {
    fontSize: TYPOGRAPHY.caption.size,
    color: COLORS.status.error,
    marginTop: SPACING.sm,
  },
});

export default TextInputField;
