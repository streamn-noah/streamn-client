import React, { useState } from 'react';
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

export default function TermsAndLegalScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'dmca' | 'terms' | 'privacy'>('dmca');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Icon name="arrow-left-line" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Legal</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'dmca' && styles.tabBtnActive]}
          onPress={() => setActiveTab('dmca')}
        >
          <Text style={[styles.tabText, activeTab === 'dmca' && styles.tabTextActive]}>
            DMCA Policy
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'terms' && styles.tabBtnActive]}
          onPress={() => setActiveTab('terms')}
        >
          <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
            Terms of Use
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'privacy' && styles.tabBtnActive]}
          onPress={() => setActiveTab('privacy')}
        >
          <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
            Privacy
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      <View style={styles.bodyCard}>
        {activeTab === 'dmca' && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Digital Millennium Copyright Act (DMCA)</Text>

            <Text style={styles.paragraph}>
              StreamN respects the intellectual property rights of others and expects its users to do the same. In accordance with the Digital Millennium Copyright Act of 1998 (&quot;DMCA&quot;), StreamN will respond expeditiously to claims of copyright infringement.
            </Text>

            <Text style={styles.subHeading}>Content Disclaimer & Indexing Notice</Text>
            <Text style={styles.paragraph}>
              StreamN does not host, upload, store, or transmit any video content or media files on its servers. StreamN operates strictly as a search engine and directory indexing third-party public web links. All media streams made accessible through the platform are provided by independent third-party sources not affiliated with StreamN.
            </Text>

            <Text style={styles.subHeading}>Filing a Takedown Notice</Text>
            <Text style={styles.paragraph}>
              If you are a copyright owner or an authorized agent thereof and believe that any content indexed on StreamN infringes upon your copyright, you may submit a notification pursuant to the DMCA by providing our Copyright Agent with the following information in writing:
            </Text>

            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>1. A physical or electronic signature of a person authorized to act on behalf of the owner of an exclusive right that is allegedly infringed.</Text>
              <Text style={styles.bulletItem}>2. Identification of the copyrighted work claimed to have been infringed.</Text>
              <Text style={styles.bulletItem}>3. Identification of the material that is claimed to be infringing and information reasonably sufficient to permit StreamN to locate the material.</Text>
              <Text style={styles.bulletItem}>4. Information reasonably sufficient to contact you, such as an address, telephone number, and email address.</Text>
              <Text style={styles.bulletItem}>5. A statement that you have a good faith belief that use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.</Text>
              <Text style={styles.bulletItem}>6. A statement that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the copyright owner.</Text>
            </View>

            <Text style={styles.subHeading}>Designated Copyright Agent</Text>
            <Text style={styles.contactEmail}>Email: dmca@streamn.app</Text>
          </View>
        )}

        {activeTab === 'terms' && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Terms of Service</Text>
            <Text style={styles.paragraph}>
              Welcome to StreamN. By accessing or using our application, you agree to be bound by these Terms of Service. If you do not agree to all of these terms, please do not use the application.
            </Text>

            <Text style={styles.subHeading}>1. User Agreement</Text>
            <Text style={styles.paragraph}>
              You must be at least 13 years of age to use this application. By using StreamN, you represent and warrant that you meet this requirement.
            </Text>

            <Text style={styles.subHeading}>2. Permitted Use</Text>
            <Text style={styles.paragraph}>
              StreamN is provided for personal, non-commercial entertainment purposes only. You agree not to attempt to reverse engineer, decompile, or misuse any portion of the service.
            </Text>

            <Text style={styles.subHeading}>3. Third-Party Links & Services</Text>
            <Text style={styles.paragraph}>
              StreamN provides references to third-party web services and databases (including TMDB, IntroDB, and open media providers). We do not control or endorse third-party web content and are not responsible for their availability or safety.
            </Text>
          </View>
        )}

        {activeTab === 'privacy' && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Privacy Policy</Text>
            <Text style={styles.paragraph}>
              Your privacy is important to us. StreamN collects minimal data required to deliver custom playback and sync watchlist progress across your devices.
            </Text>

            <Text style={styles.subHeading}>Information We Store</Text>
            <Text style={styles.paragraph}>
              - Account authentication details (email, encrypted credentials) via Firebase.
              - Local watch history and progress indicators stored on your device.
              - Selected player settings (video quality, adult content filter preferences).
            </Text>

            <Text style={styles.subHeading}>Data Protection</Text>
            <Text style={styles.paragraph}>
              We do not sell, rent, or share your personal data with third parties or advertising brokers.
            </Text>
          </View>
        )}
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
  tabsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#121214',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#00D2FF',
  },
  tabText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  tabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  bodyCard: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#141416',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionContainer: {},
  sectionTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 16,
  },
  subHeading: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: 15,
    color: '#00D2FF',
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 8,
  },
  paragraph: {
    fontFamily: fontFamilies.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  bulletList: {
    marginTop: 10,
    gap: 8,
  },
  bulletItem: {
    fontFamily: fontFamilies.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
  },
  contactEmail: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 8,
  },
});
