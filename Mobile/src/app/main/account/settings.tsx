import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-remix-icon';

import { useAuth } from '@/components/providers/auth-provider';
import { colors, fontFamilies } from '@/constants/theme';
import {
  getAdultContentEnabled,
  setAdultContentEnabled,
  getPreferredVideoQuality,
  VideoQualityOption,
} from '@/services/storage';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

  const [isAdultContent, setIsAdultContent] = useState(false);
  const [videoQuality, setVideoQuality] = useState<VideoQualityOption>('hd');

  useEffect(() => {
    async function loadSettings() {
      const adult = await getAdultContentEnabled();
      const quality = await getPreferredVideoQuality();
      setIsAdultContent(adult);
      setVideoQuality(quality);
    }
    loadSettings();
  }, []);

  const handleToggleAdult = async (value: boolean) => {
    setIsAdultContent(value);
    await setAdultContentEnabled(value);
  };

  const handleOpenSpeedTest = () => {
    Linking.openURL('https://fast.com').catch(() => {
      Alert.alert('Error', 'Unable to open speed test site.');
    });
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  };

  const qualityLabels: Record<VideoQualityOption, string> = {
    hd: 'HD (1080p)',
    best: 'Best (720p)',
    better: 'Better (480p)',
    good: 'Good (360p)',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-left-line" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* 1. Account & Profile */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Account</Text>
      </View>
      <View style={styles.optionsGroup}>
        <TouchableOpacity
          style={[styles.optionRow, styles.lastOptionRow]}
          onPress={() => router.push('/main/account/edit-profile' as any)}
          activeOpacity={0.7}
        >
          <View style={styles.optionLeft}>
            <Icon name="user-3-line" size={22} color="#fff" style={styles.optionIcon} />
            <Text style={styles.optionText}>Edit Profile</Text>
          </View>
          <Icon name="arrow-right-s-line" size={20} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>

      {/* 2. Playback & Content */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Playback & Content</Text>
      </View>
      <View style={styles.optionsGroup}>
        {/* Video Quality */}
        <TouchableOpacity
          style={styles.optionRow}
          onPress={() => router.push('/main/account/video-quality' as any)}
          activeOpacity={0.7}
        >
          <View style={styles.optionLeft}>
            <Icon name="film-line" size={22} color="#fff" style={styles.optionIcon} />
            <View>
              <Text style={styles.optionText}>Default Video Quality</Text>
              <Text style={styles.optionSubtext}>{qualityLabels[videoQuality] || 'HD (1080p)'}</Text>
            </View>
          </View>
          <Icon name="arrow-right-s-line" size={20} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>

        {/* Adult Content Toggle */}
        <View style={[styles.optionRow, styles.lastOptionRow]}>
          <View style={styles.optionLeftFlex}>
            <Icon name="shield-user-line" size={22} color="#fff" style={styles.optionIcon} />
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.optionText}>Adult Content</Text>
              <Text style={styles.optionSubtext}>Allow TMDB to search and include adult-rated titles</Text>
            </View>
          </View>
          <Switch
            value={isAdultContent}
            onValueChange={handleToggleAdult}
            trackColor={{ false: '#3A3A3A', true: '#00D2FF' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* 3. Tools & Network */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Tools & Network</Text>
      </View>
      <View style={styles.optionsGroup}>
        <TouchableOpacity style={[styles.optionRow, styles.lastOptionRow]} onPress={handleOpenSpeedTest} activeOpacity={0.7}>
          <View style={styles.optionLeft}>
            <Icon name="speed-line" size={22} color="#fff" style={styles.optionIcon} />
            <View>
              <Text style={styles.optionText}>Internet Speed Test</Text>
              <Text style={styles.optionSubtext}>Test your current connection speed on Fast.com</Text>
            </View>
          </View>
          <Icon name="external-link-line" size={18} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>

      {/* 4. Legal & About */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>Legal & About</Text>
      </View>
      <View style={styles.optionsGroup}>
        <TouchableOpacity
          style={styles.optionRow}
          onPress={() => router.push('/main/account/terms-legal' as any)}
          activeOpacity={0.7}
        >
          <View style={styles.optionLeft}>
            <Icon name="file-text-line" size={22} color="#fff" style={styles.optionIcon} />
            <Text style={styles.optionText}>Terms & Legal (DMCA)</Text>
          </View>
          <Icon name="arrow-right-s-line" size={20} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>


      </View>

      {/* 5. Account Actions */}
      <View style={styles.optionsGroup}>
        <TouchableOpacity
          style={[styles.optionRow, styles.lastOptionRow]}
          onPress={handleSignOut}
          activeOpacity={0.7}
        >
          <View style={styles.optionLeft}>
            <Icon name="logout-box-r-line" size={22} color={colors.danger} style={styles.optionIcon} />
            <Text style={[styles.optionText, { color: colors.danger }]}>Sign Out</Text>
          </View>
          <Icon name="arrow-right-s-line" size={20} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      </View>

      {/* Version Info */}
      <Text style={styles.versionText}>StreamN v1.0.0 (1)</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontFamily: fontFamilies.bodySemiBold,
    fontWeight: '600',
    fontSize: 20,
    color: '#fff',
    textAlign: 'center',
    flex: 1,
  },
  sectionHeader: {
    marginTop: 20,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionHeaderText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 12,
    color: '#a1a1a1',
    fontWeight: '700',
  },
  optionsGroup: {
    marginHorizontal: 16,
    backgroundColor: '#121214',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 12
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  lastOptionRow: {
    borderBottomWidth: 0,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionLeftFlex: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIcon: {
    marginRight: 14,
  },
  optionText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  optionSubtext: {
    fontFamily: fontFamilies.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  versionText: {
    fontFamily: fontFamilies.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: 28,
  },
});
