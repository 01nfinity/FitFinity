import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { useAuth } from '../../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { fetchAdminUsers, updateUserAdmin, deleteUser } from '../../database/api';
import { showAlert, confirmAction } from '../../utils/alert';
import { Shield, Trash2, UserCheck, UserX, KeyRound } from 'lucide-react-native';
import ChangePasswordModal from '../../components/ChangePasswordModal';

export default function AdminUsersScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const { userId: currentUserId, isAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [passwordTarget, setPasswordTarget] = useState<{ id: number; username: string } | null>(null);

  const loadUsers = async () => {
    try {
      const data = await fetchAdminUsers();
      setUsers(data);
    } catch (e: any) {
      showAlert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadUsers(); }, []));

  const toggleAdmin = async (user: any) => {
    try {
      await updateUserAdmin(user.id, !user.isAdmin);
      loadUsers();
    } catch (e: any) {
      showAlert('Error', e.message);
    }
  };

  const confirmDelete = (user: any) => {
    confirmAction(
      'Delete User',
      `Are you sure you want to delete "${user.username}"? All their data will be removed.`,
      'Delete',
      async () => {
        try {
          await deleteUser(user.id);
          loadUsers();
        } catch (e: any) {
          showAlert('Error', e.message);
        }
      }
    );
  };

  if (!isAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Shield color={theme.text} size={64} />
        <Text style={[styles.title, { color: theme.text, marginTop: 20 }]}>Admin Access Only</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>User Management</Text>
      <Text style={[styles.subtitle, { color: theme.text + '88' }]}>
        {users.length} registered {users.length === 1 ? 'user' : 'users'}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={{ paddingTop: 16 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.userInfo}>
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>{item.username.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.userDetails}>
                  <Text style={[styles.username, { color: theme.text }]}>{item.username}</Text>
                  <View style={styles.badges}>
                    {item.isAdmin && (
                      <View style={[styles.badge, { backgroundColor: '#F59E0B22' }]}>
                        <Shield size={12} color="#F59E0B" />
                        <Text style={[styles.badgeText, { color: '#F59E0B' }]}>Admin</Text>
                      </View>
                    )}
                    {item.id === currentUserId && (
                      <View style={[styles.badge, { backgroundColor: theme.tint + '22' }]}>
                        <Text style={[styles.badgeText, { color: theme.tint }]}>You</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.actions}>
                <View style={styles.adminToggle}>
                  <Text style={[styles.adminLabel, { color: theme.text + '88' }]}>Admin</Text>
                  <Switch
                    value={item.isAdmin}
                    onValueChange={() => toggleAdmin(item)}
                    disabled={item.id === currentUserId}
                    trackColor={{ false: theme.border, true: '#F59E0B' }}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.deleteButton, { backgroundColor: theme.tint + '22' }]}
                  onPress={() => setPasswordTarget({ id: item.id, username: item.username })}
                >
                  <KeyRound size={18} color={theme.tint} />
                </TouchableOpacity>
                {item.id !== currentUserId && (
                  <TouchableOpacity
                    style={[styles.deleteButton, { backgroundColor: '#EF444422' }]}
                    onPress={() => confirmDelete(item)}
                  >
                    <Trash2 size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      {passwordTarget && (
        <ChangePasswordModal
          visible={passwordTarget !== null}
          onClose={() => setPasswordTarget(null)}
          targetUserId={passwordTarget.id}
          targetUsername={passwordTarget.username}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold' },
  subtitle: { fontSize: 14, marginTop: 4, marginBottom: 8 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  userDetails: { flex: 1 },
  username: { fontSize: 16, fontWeight: '600' },
  badges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, gap: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  adminToggle: { alignItems: 'center', gap: 2 },
  adminLabel: { fontSize: 10 },
  deleteButton: { padding: 10, borderRadius: 10 },
});
