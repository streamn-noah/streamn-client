import React, { useEffect } from 'react';
import { Tabs } from 'expo-router/tabs';
import { useRouter, useSegments } from 'expo-router';
import { StyleSheet, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '@/constants/theme';
import { DefaultAvatarFace } from '@/components/ui/default-avatar';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import {
  HomeSmileAngleIcon as HomeSmileAngleBold,
  MagnifierIcon as MagnifierBold,
  ArchiveDownMinimalisticIcon as ArchiveDownMinimalisticBold,
} from '@solar-icons/react-native/bold';
import {
  HomeSmileAngleIcon as HomeSmileAngleLinear,
  MagnifierIcon as MagnifierLinear,
  ArchiveDownMinimalisticIcon as ArchiveDownMinimalisticLinear,
} from '@solar-icons/react-native/linear';

export default function MainLayout() {
  const { isOffline } = useNetworkStatus();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isOffline) {
      const isPlayer = segments[0] === 'player';
      const isDownloads = segments[0] === 'main' && segments[1] === 'downloads';

      if (!isPlayer && !isDownloads) {
        router.replace('/main/downloads');
      }
    }
  }, [isOffline, segments]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255, 255, 255, 0.08)',
          elevation: 0,
          height: Platform.OS === 'ios' ? 88 : 70,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bg,
          paddingTop: 4,
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
          ) : null,
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.textSecondary,
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          href: isOffline ? null : undefined,
          tabBarIcon: ({ focused }) =>
            focused ? (
              <HomeSmileAngleBold size={24} color={colors.white} />
            ) : (
              <HomeSmileAngleLinear size={24} color={colors.textSecondary} />
            ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          href: isOffline ? null : undefined,
          tabBarIcon: ({ focused }) =>
            focused ? (
              <MagnifierLinear size={24} color={colors.white} />
            ) : (
              <MagnifierLinear size={24} color={colors.textSecondary} />
            ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Downloads',
          tabBarIcon: ({ focused }) =>
            focused ? (
              <ArchiveDownMinimalisticBold size={24} color={colors.white} />
            ) : (
              <ArchiveDownMinimalisticLinear size={24} color={colors.textSecondary} />
            ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          href: isOffline ? null : undefined,
          tabBarIcon: ({ focused }) => (
            <View style={focused ? styles.activeAvatarWrapper : styles.inactiveAvatarWrapper}>
              <DefaultAvatarFace size={26} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

/*
// Glow indicator commented out as requested
function TabIcon({ name, color, focused, isAvatar }: { name: any; color: any; focused: boolean; isAvatar?: boolean }) {
  const opacity = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(focused ? 1 : 0, {
      duration: 300,
      easing: Easing.out(Easing.ease),
    });
  }, [focused]);

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={styles.iconContainer}>
      <Animated.View style={[styles.glowContainer, animatedGlowStyle]}>
        <View style={styles.glowSquash}>
          <Svg height="160" width="160">
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
                <Stop offset="40%" stopColor="#ffffff" stopOpacity="0.2" />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width="160" height="160" fill="url(#glow)" />
          </Svg>
        </View>
      </Animated.View>

      {isAvatar ? (
        <DefaultAvatarFace size={24} />
      ) : (
        <Icon name={name} size={28} color={color} />
      )}
    </View>
  );
}
*/

const styles = StyleSheet.create({
  activeAvatarWrapper: {
    opacity: 1,
  },
  inactiveAvatarWrapper: {
    opacity: 0.7,
  },
});
