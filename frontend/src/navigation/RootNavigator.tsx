import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackScreenProps } from '@react-navigation/stack';
import SearchScreen from '../screens/SearchScreen';
import GuideScreen from '../screens/GuideScreen';
import ReviewScreen from '../screens/ReviewScreen';
import { COLORS } from '../constants/design';

export type RootStackParamList = {
  Search: undefined;
  Guide: { eventId: string; eventName: string };
  Review: { eventId: string; eventName: string };
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 * RootNavigator
 * 3画面のスタックナビゲーション
 * Search → Guide → Review の流れ
 */
export const RootNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        id="RootStack"
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: COLORS.background.primary },
        }}
      >
        {/* 検索画面 */}
        <Stack.Screen
          name="Search"
          component={SearchScreenContainer}
          options={{
            headerShown: false,
          }}
        />

        {/* ナビゲーション画面 */}
        <Stack.Screen
          name="Guide"
          component={GuideScreenContainer}
          options={{
            headerShown: false,
          }}
        />

        {/* 評価画面 */}
        <Stack.Screen
          name="Review"
          component={ReviewScreenContainer}
          options={{
            headerShown: false,
          }}
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
