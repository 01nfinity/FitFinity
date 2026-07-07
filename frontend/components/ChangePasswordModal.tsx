import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';
import { resetPassword } from '../database/api';
import { showAlert } from '../utils/alert';

type Props = {
  visible: boolean;
  onClose: () => void;
  targetUserId: number;
  // Omit for a self-service "change your own password" modal; pass the
  // target's username when an admin is resetting someone else's.
  targetUsername?: string;
  onSuccess?: () => void;
};

export default function ChangePasswordModal({ visible, onClose, targetUserId, targetUsername, onSuccess }: Props) {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const resetFields = () => {
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleClose = () => {
    if (saving) return;
    resetFields();
    onClose();
  };

  const handleSave = async () => {
    if (newPassword.length < 6) {
      showAlert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("Passwords Don't Match", 'Please make sure both fields match.');
      return;
    }
    setSaving(true);
    try {
      await resetPassword(targetUserId, newPassword);
      resetFields();
      onClose();
      showAlert('Success', targetUsername ? `Password updated for "${targetUsername}".` : 'Your password has been updated.');
      onSuccess?.();
    } catch (e: any) {
      showAlert('Error', e.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>
            {targetUsername ? `Reset Password for "${targetUsername}"` : 'Change Your Password'}
          </Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="New Password"
            placeholderTextColor={theme.tabIconDefault}
            secureTextEntry
            autoCapitalize="none"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="Confirm New Password"
            placeholderTextColor={theme.tabIconDefault}
            secureTextEntry
            autoCapitalize="none"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={[styles.button, { borderColor: theme.border, borderWidth: 1 }]}
              onPress={handleClose}
              disabled={saving}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.tint }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={theme.onTint} /> : <Text style={[styles.buttonText, { color: theme.onTint }]}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
