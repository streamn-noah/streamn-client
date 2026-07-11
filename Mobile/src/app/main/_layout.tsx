import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';
import Icon from 'react-native-remix-icon';
import { colors } from '@/constants/theme';

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          elevation: 0,
          height: 80,
          backgroundColor: 'transparent',
        },
        tabBarBackground: () => (
          <BlurView intensity={80} style={StyleSheet.absoluteFill} tint="dark" />
        ),
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: 'Satoshi-Medium',
          fontSize: 12,
          marginBottom: 10,
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home-fill" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="search-line" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Downloads',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="download-2-line" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'My Stuff',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="user-3-fill" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, color, focused }: { name: any; color: any; focused: boolean }) {
  return (
    <View style={styles.iconContainer}>
      {focused && (
        <View style={styles.glowContainer}>
          <View style={styles.glow} />
        </View>
      )}
      <Icon name={name} size={28} color={color} />
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
    top: -15, // Adjust based on tab bar height padding
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  glow: {
    width: 40,
    height: 4,
    backgroundColor: colors.white,
    borderRadius: 2,
    shadowColor: colors.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
});
