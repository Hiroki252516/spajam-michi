import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackScreenProps } from '@react-navigation/stack';
import SearchScreen from '../screens/SearchScreen';
import GuideScreen from '../screens/GuideScreen';
import ReviewScreen from '../screens/ReviewScreen';
import LoginScreen from '../screens/LoginScreen';
import MyPageScreen from '../screens/MyPageScreen';
import RegisterScreen from '../screens/RegisterScreen';
import { COLORS } from '../constants/design';
import { useAuth } from '../context/AuthContext';

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
 * 起動時ログイン強制（未ログイン時はログイン/登録画面、ログイン後はメイン画面へ遷移）
 */
export const RootNavigator: React.FC = () => {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.canvas }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        id="RootStack"
        initialRouteName={isLoggedIn ? 'Search' : 'Login'}
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: COLORS.canvas },
        }}
      >
        {!isLoggedIn ? (
          /* 未ログイン時: ログイン画面・新規登録画面を強制 */
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreenContainer}
            />
            <Stack.Screen
              name="Register"
              component={RegisterScreenContainer}
            />
          </>
        ) : (
          /* ログイン済み時: メインコンテンツ画面群 */
          <>
            <Stack.Screen
              name="Search"
              component={SearchScreenContainer}
            />
            <Stack.Screen
              name="MyPage"
              component={MyPageScreenContainer}
            />
            <Stack.Screen
              name="Guide"
              component={GuideScreenContainer}
            />
            <Stack.Screen
              name="Review"
              component={ReviewScreenContainer}
            />
          </>
        )}
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
        // AuthContext の isLoggedIn が true に変わるため自動的にメイン画面へ切り替わります
      }}
      onNavigateToRegister={() => {
        navigation.push('Register');
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
        // AuthContext の isLoggedIn が true に変わるため自動的にメイン画面へ切り替わります
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
