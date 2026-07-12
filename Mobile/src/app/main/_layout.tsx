import React, { useEffect } from 'react';
import { Tabs } from 'expo-router/tabs';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';
import Icon from 'react-native-remix-icon';
import { colors } from '@/constants/theme';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { DefaultAvatarFace } from '@/components/ui/default-avatar';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.2)',
          elevation: 0,
          height: 90,
          backgroundColor: 'transparent',
          paddingTop: 8,
        },
        tabBarBackground: () => (
          <BlurView intensity={100} style={StyleSheet.absoluteFill} tint="dark" />
        ),
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: 'System',
          fontWeight: '500',
          fontSize: 10,
          marginBottom: 10,
          marginTop: 6, // Increase space between icon and label
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'home-fill' : 'home-line'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'search-fill' : 'search-line'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'bookmark-fill' : 'bookmark-line'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="" color={color} focused={focused} isAvatar={true} />
          ),
        }}
      />
    </Tabs>
  );
}

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

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: 60,
  },
  glowContainer: {
    position: 'absolute',
    top: -15, // Precisely on the top border
    left: -50, // Center 160px width inside 60px icon container ((60 - 160) / 2)
    width: 160,
    height: 70, // Large enough to fit the bottom half of the glow
    overflow: 'hidden', // Clips the top half that would bleed above the tab bar
    zIndex: -1,
  },
  glowSquash: {
    position: 'absolute',
    left: 0,
    top: -80,  // Center the 160px high SVG exactly at y=0 (the top border)
    width: 160,
    height: 160,
    transform: [{ scaleY: 0.7 }], // Radiates 56px downwards, perfectly stopping halfway behind the icon
  },
});
