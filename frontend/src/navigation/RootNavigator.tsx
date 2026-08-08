import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackScreenProps } from '@react-navigation/stack';
import SearchScreen from '../screens/SearchScreen';
import GuideScreen from '../screens/GuideScreen';
import ReviewScreen from '../screens/ReviewScreen';
import LoginScreen from '../screens/LoginScreen';
import MyPageScreen from '../screens/MyPageScreen';
import RegisterScreen from '../screens/RegisterScreen';
import { COLORS } from '../constants/design';

export type RootStackParamList = {
  Search: undefined;
  Guide: { eventId: string; eventName: string };
  Review: { eventId: string; eventName: string };
  Login: undefined;
  Register: undefined;
  MyPage: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 * RootNavigator
 * ログイン・新規登録・マイページ・検索・ガイド・評価画面のスタックナビゲーション
 */
export const RootNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        id="RootStack"
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: COLORS.canvas },
        }}
      >
        {/* 検索画面 */}
        <Stack.Screen
          name="Search"
          component={SearchScreenContainer}
        />

        {/* ログイン画面 */}
        <Stack.Screen
          name="Login"
          component={LoginScreenContainer}
        />

        {/* 新規登録画面 */}
        <Stack.Screen
          name="Register"
          component={RegisterScreenContainer}
        />

        {/* マイページ画面 */}
        <Stack.Screen
          name="MyPage"
          component={MyPageScreenContainer}
        />

        {/* ナビゲーション画面 */}
        <Stack.Screen
          name="Guide"
          component={GuideScreenContainer}
        />

        {/* 評価画面 */}
        <Stack.Screen
          name="Review"
          component={ReviewScreenContainer}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

/**
 * SearchScreen コンテナ
 */
const SearchScreenContainer: React.FC<StackScreenProps<RootStackParamList, 'Search'>> = ({
  navigation,
}) => {
  return (
    <SearchScreen
      onEventSelect={(eventId, eventName) => {
        navigation.push('Guide', { eventId, eventName });
      }}
      onOpenLogin={() => {
        navigation.push('Login');
      }}
      onOpenMyPage={() => {
        navigation.push('MyPage');
      }}
    />
  );
};

/**
 * LoginScreen コンテナ
 */
const LoginScreenContainer: React.FC<StackScreenProps<RootStackParamList, 'Login'>> = ({
  navigation,
}) => {
  return (
    <LoginScreen
      onLoginSuccess={() => {
        navigation.replace('MyPage');
      }}
      onNavigateToRegister={() => {
        navigation.push('Register');
      }}
      onGoBack={() => {
        navigation.goBack();
      }}
    />
  );
};

/**
 * RegisterScreen コンテナ
 */
const RegisterScreenContainer: React.FC<StackScreenProps<RootStackParamList, 'Register'>> = ({
  navigation,
}) => {
  return (
    <RegisterScreen
      onRegisterSuccess={() => {
        navigation.replace('MyPage');
      }}
      onNavigateToLogin={() => {
        navigation.push('Login');
      }}
      onGoBack={() => {
        navigation.goBack();
      }}
    />
  );
};

/**
 * MyPageScreen コンテナ
 */
const MyPageScreenContainer: React.FC<StackScreenProps<RootStackParamList, 'MyPage'>> = ({
  navigation,
}) => {
  return (
    <MyPageScreen
      onGoBack={() => {
        navigation.goBack();
      }}
      onLogoutSuccess={() => {
        navigation.popToTop();
      }}
    />
  );
};

/**
 * GuideScreen コンテナ
 */
const GuideScreenContainer: React.FC<StackScreenProps<RootStackParamList, 'Guide'>> = ({
  navigation,
  route,
}) => {
  const { eventId, eventName } = route.params;

  return (
    <GuideScreen
      eventId={eventId}
      eventName={eventName}
      onArrived={() => {
        navigation.replace('Review', { eventId, eventName });
      }}
      onGoBack={() => {
        navigation.goBack();
      }}
    />
  );
};

/**
 * ReviewScreen コンテナ
 */
const ReviewScreenContainer: React.FC<StackScreenProps<RootStackParamList, 'Review'>> = ({
  navigation,
  route,
}) => {
  const { eventId, eventName } = route.params;

  return (
    <ReviewScreen
      eventId={eventId}
      eventName={eventName}
      onReviewSubmitted={() => {
        navigation.popToTop();
      }}
      onGoBack={() => {
        navigation.goBack();
      }}
    />
  );
};
