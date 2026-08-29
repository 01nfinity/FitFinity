import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

// Refetches on two triggers: React Navigation focus (switching tabs/screens
// in-app) and the app resuming from the background while this screen is the
// focused one. useFocusEffect alone only covers the first case -- it does
// NOT fire when the OS backgrounds/foregrounds the app without an in-app
// navigation change, which is exactly what happens when someone edits data
// elsewhere (e.g. the web app) and switches back to an already-open mobile
// app sitting on the same tab. Without this, that screen can show
// arbitrarily stale data with no indication anything is wrong.
export function useAutoRefresh(loadFn: () => void | Promise<void>) {
  const isFocusedRef = useRef(false);
  const loadFnRef = useRef(loadFn);
  loadFnRef.current = loadFn;

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      loadFnRef.current();
      return () => { isFocusedRef.current = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && isFocusedRef.current) {
        loadFnRef.current();
      }
    });
    return () => sub.remove();
  }, []);
}
