import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CloudOff, WifiOff, RefreshCw } from 'lucide-react-native';

type Props = {
  theme: any;
  pendingCount: number;
  isOffline: boolean;
  syncing: boolean;
  onSyncNow: () => void;
};

// Shared banner for Log/Templates/Exercises: shown whenever there's
// something queued to sync back to the server, or the last fetch had to
// fall back to cached data because the network was unreachable. Both states
// share one queue/status source (services/offlineSync.ts) across logs,
// templates, and exercises, so this banner looks the same everywhere it's used.
export function SyncStatusBanner({ theme, pendingCount, isOffline, syncing, onSyncNow }: Props) {
  if (pendingCount === 0 && !isOffline) return null;

  const label = pendingCount > 0
    ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} saved offline, not yet synced`
    : "You're offline — showing the last synced data";

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={pendingCount > 0 ? onSyncNow : undefined}
      disabled={syncing || pendingCount === 0}
      activeOpacity={pendingCount > 0 ? 0.7 : 1}
    >
      {isOffline ? <WifiOff color={theme.tabIconDefault} size={16} /> : <CloudOff color={theme.tabIconDefault} size={16} />}
      <Text style={[styles.text, { color: theme.tabIconDefault }]}>{label}</Text>
      {pendingCount > 0 && (
        syncing ? (
          <ActivityIndicator size="small" color={theme.tint} />
        ) : (
          <View style={styles.syncNowRow}>
            <RefreshCw color={theme.tint} size={14} />
            <Text style={[styles.syncNowText, { color: theme.tint }]}>Sync Now</Text>
          </View>
        )
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  text: { flex: 1, fontSize: 12, fontWeight: '600' },
  syncNowRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncNowText: { fontSize: 12, fontWeight: '700' },
});
