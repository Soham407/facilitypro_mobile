import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { LightColors, DarkColors } from '../constants/colors';
import { FontFamily, FontSize, FontWeight } from '../constants/typography';

interface HomeScreenProps {
  colorScheme: 'light' | 'dark';
}

export default function HomeScreen({ colorScheme }: HomeScreenProps) {
  const isDark = colorScheme === 'dark';
  const colors = isDark ? DarkColors : LightColors;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.container}>
        
        {/* 1. FacilityPro Logo */}
        <View style={styles.section}>
          <View style={styles.logoRow}>
            <View style={styles.logoBox}>
              <Text style={styles.logoBoxText}>F</Text>
            </View>
            <View>
              <Text style={[styles.logoName, { color: colors.foreground }]}>FacilityPro</Text>
              <Text style={styles.logoSubtitle}>ENTERPRISE</Text>
            </View>
          </View>
        </View>

        {/* 2. Color Palette */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Colors</Text>
          <View style={styles.colorRow}>
            <ColorSwatch color={colors.primary} label="Primary" />
            <ColorSwatch color={colors.success} label="Success" />
            <ColorSwatch color={colors.warning} label="Warning" />
            <ColorSwatch color={colors.destructive} label="Destructive" />
            <ColorSwatch color={colors.info} label="Info" />
            <ColorSwatch color={colors.accentSecondary} label="Accent Sec" />
          </View>
        </View>

        {/* 3. Typography Specimen */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Typography</Text>
          <Text style={[styles.headingText, { color: colors.foreground }]}>Heading</Text>
          <Text style={[styles.bodyText, { color: colors.foreground }]}>Body text</Text>
          <Text style={[styles.labelText, { color: colors.mutedForeground }]}>LABEL</Text>
          <Text style={[styles.monoText, { color: colors.foreground }]}>0x1A2B3C</Text>
        </View>

        {/* 4. Buttons */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Buttons</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.border }]}>
              <Text style={[styles.outlineButtonText, { color: colors.foreground }]}>Learn More</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 5. Sample Card */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Card Component</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>System Status</Text>
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeText}>Active</Text>
              </View>
            </View>
            <Text style={[styles.cardDescription, { color: colors.mutedForeground }]}>
              All core services are running normally with no reported issues.
            </Text>
          </View>
        </View>

        {/* 6. Sentry Test */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Diagnostics</Text>
          <TouchableOpacity 
            style={[styles.outlineButton, { borderColor: colors.destructive }]}
            onPress={() => {
              throw new Error("Sentry Test Error from FacilityPro");
            }}
          >
            <Text style={[styles.outlineButtonText, { color: colors.destructive }]}>Test Sentry Crash</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const ColorSwatch = ({ color, label }: { color: string; label: string }) => (
  <View style={styles.swatchContainer}>
    <View style={[styles.swatchCircle, { backgroundColor: color }]} />
    <Text style={styles.swatchLabel} numberOfLines={1}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    padding: 24,
  },
  section: {
    marginBottom: 40,
  },
  sectionTitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.lg,
    marginBottom: 16,
    opacity: 0.5,
  },
  
  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EB5E3B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EB5E3B',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  logoBoxText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: FontFamily.sansBold,
  },
  logoName: {
    fontFamily: FontFamily.headingBold,
    fontSize: 18,
  },
  logoSubtitle: {
    fontFamily: FontFamily.sansExtraBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#EB5E3B',
  },

  // Colors
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  swatchContainer: {
    alignItems: 'center',
    width: 48,
    marginBottom: 12,
  },
  swatchCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 8,
  },
  swatchLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: '#7A7266', // mostly visible on both modes
    textAlign: 'center',
  },

  // Typography
  headingText: {
    fontFamily: FontFamily.headingBold,
    fontSize: 24,
    marginBottom: 8,
  },
  bodyText: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    marginBottom: 8,
  },
  labelText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  monoText: {
    fontFamily: FontFamily.mono,
    fontSize: 13,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    height: 40,
    backgroundColor: '#EB5E3B',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },
  outlineButton: {
    flex: 1,
    height: 40,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButtonText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 14,
  },

  // Card
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#1A150D',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 16,
  },
  cardDescription: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
  },
  successBadge: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  successBadgeText: {
    color: '#15803D',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
  },
});
