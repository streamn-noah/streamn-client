import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-remix-icon';

import { fontFamilies } from '@/constants/theme';
import { getPreferredVideoQuality, setPreferredVideoQuality, VideoQualityOption } from '@/services/storage';

export default function VideoQualityScreen() {
  const router = useRouter();
  const [selectedQuality, setSelectedQuality] = useState<VideoQualityOption>('hd');

  useEffect(() => {
    async function loadState() {
      const q = await getPreferredVideoQuality();
      setSelectedQuality(q);
    }
    loadState();
  }, []);

  const handleSelectQuality = async (quality: VideoQualityOption) => {
    setSelectedQuality(quality);
    await setPreferredVideoQuality(quality);
  };

  const options: { key: VideoQualityOption; label: string; sublabel: string; tag: string }[] = [
    {
      key: 'hd',
      label: 'HD (1080p)',
      sublabel: 'Full High Definition with maximum clarity and detail.',
      tag: 'Recommended',
    },
    {
      key: 'best',
      label: 'Best (720p)',
      sublabel: 'High quality video with lower data consumption.',
      tag: 'Balanced',
    },
    {
      key: 'better',
      label: 'Better (480p)',
      sublabel: 'Standard definition for faster loading and smooth playback.',
      tag: 'Standard',
    },
    {
      key: 'good',
      label: 'Good (360p)',
      sublabel: 'Lower resolution to conserve maximum mobile data.',
      tag: 'Data Saver',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-left-line" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Default Video Quality</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitle}>
        Select your preferred default streaming resolution. This will automatically select matching stream sources when playing content.
      </Text>

      {/* Quality Options */}
      <View style={styles.optionsList}>
        {options.map((item) => {
          const isSelected = selectedQuality === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.optionCard, isSelected && styles.optionCardActive]}
              onPress={() => handleSelectQuality(item.key)}
              activeOpacity={0.8}
            >
              <View style={styles.optionContent}>
                <View style={styles.optionHeaderRow}>
                  <Text style={[styles.optionTitle, isSelected && { color: '#00D2FF' }]}>
                    {item.label}
                  </Text>
                  <View style={[styles.tagBadge, isSelected && styles.tagBadgeActive]}>
                    <Text style={[styles.tagText, isSelected && { color: '#000000' }]}>{item.tag}</Text>
                  </View>
                </View>

                <Text style={styles.optionSublabel}>{item.sublabel}</Text>
              </View>

              <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                {isSelected && <View style={styles.radioInnerCircle} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
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
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 24,
    lineHeight: 20,
  },
  optionsList: {
    paddingHorizontal: 16,
    gap: 14,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141416',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  optionCardActive: {
    borderColor: '#00D2FF',
    backgroundColor: 'rgba(0, 210, 255, 0.05)',
  },
  optionContent: {
    flex: 1,
    paddingRight: 16,
  },
  optionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  optionTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontWeight: '700',
    fontSize: 16,
    color: '#FFFFFF',
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tagBadgeActive: {
    backgroundColor: '#00D2FF',
  },
  tagText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
  },
  optionSublabel: {
    fontFamily: fontFamilies.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 17,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#00D2FF',
  },
  radioInnerCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00D2FF',
  },
});
