import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { useSQLiteContext } from 'expo-sqlite';
import { useIsFocused } from '@react-navigation/native';

export default function DashboardScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const db = useSQLiteContext();
  const isFocused = useIsFocused();

  const screenWidth = Dimensions.get('window').width - 64;

  const [repsData, setRepsData] = useState<any[]>([]);
  const [weightData, setWeightData] = useState<any[]>([]);
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStats = async () => {
    try {
      // 1. Reps Data (7 Days)
      const repsRows = await db.getAllAsync<{ date: string; total: number }>(`
        SELECT date, SUM(reps) as total 
        FROM logs 
        JOIN log_sets ON logs.id = log_sets.log_id 
        WHERE date >= date('now', '-7 days') 
        GROUP BY date 
        ORDER BY date ASC
      `);
      
      if (repsRows.length > 0) {
        setRepsData(repsRows.map(r => ({ 
          value: r.total, 
          label: r.date.split('-').slice(1).join('/'),
          dataPointText: r.total.toString() 
        })));
      } else {
        setRepsData([{value: 0, label: 'No Data'}]);
      }

      // 2. Weight Data (7 Days)
      const weightRows = await db.getAllAsync<{ date: string; total: number }>(`
        SELECT date, SUM(reps * weight) as total 
        FROM logs 
        JOIN log_sets ON logs.id = log_sets.log_id 
        WHERE date >= date('now', '-7 days') 
        GROUP BY date 
        ORDER BY date ASC
      `);
      
      if (weightRows.length > 0) {
        setWeightData(weightRows.map(r => ({ 
          value: r.total, 
          label: r.date.split('-').slice(1).join('/'),
          dataPointText: r.total >= 1000 ? (r.total / 1000).toFixed(1) + 'k' : r.total.toString()
        })));
      } else {
        setWeightData([{value: 0, label: 'No Data'}]);
      }

      // 3. Sentiment Data (Last 5 unique workouts)
      const feelRows = await db.getAllAsync<{ template_name: string; sentiment: string }>(`
        SELECT template_name, sentiment 
        FROM logs 
        WHERE sentiment IS NOT NULL
        ORDER BY date DESC, id DESC 
        LIMIT 5
      `);
      
      if (feelRows.length > 0) {
        const sentimentEmojis: Record<string, string> = { '1': '😭', '2': '🙁', '3': '😐', '4': '🙂', '5': '😆' };
        setSentimentData(feelRows.reverse().map((r, idx) => ({
          value: parseInt(r.sentiment),
          label: r.template_name.split(' ')[0], // First word of routine
          frontColor: idx % 2 === 0 ? theme.tint : theme.accent,
          topLabelComponent: () => (
            <Text style={{ color: theme.text, fontSize: 16, marginBottom: 4 }}>
              {sentimentEmojis[r.sentiment] || ''}
            </Text>
          ),
          showValuesAsTopLabel: true,
        })));
      } else {
        setSentimentData([{value: 0, label: 'N/A'}]);
      }

    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadStats();
    }
  }, [isFocused]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: theme.text }]}>Dashboard</Text>
      
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Total Reps (Recent)</Text>
        <LineChart
          data={repsData}
          width={screenWidth}
          height={180}
          color={theme.tint}
          thickness={3}
          dataPointsColor={theme.tint}
          hideRules
          yAxisColor={theme.border}
          xAxisColor={theme.border}
          yAxisTextStyle={{ color: theme.tabIconDefault }}
          xAxisLabelTextStyle={{ color: theme.tabIconDefault }}
          curved
          isAnimated
          showValuesAsDataPointsText
          textColor={theme.text}
          textFontSize={10}
          textShiftY={-10}
        />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Total Weight Vol (lbs)</Text>
        <LineChart
          data={weightData}
          width={screenWidth}
          height={180}
          color={theme.accent}
          thickness={3}
          dataPointsColor={theme.accent}
          hideRules
          yAxisColor={theme.border}
          xAxisColor={theme.border}
          yAxisTextStyle={{ color: theme.tabIconDefault }}
          xAxisLabelTextStyle={{ color: theme.tabIconDefault }}
          curved
          isAnimated
          showValuesAsDataPointsText
          textColor={theme.text}
          textFontSize={10}
          textShiftY={-10}
        />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>How I Feel (Last 5)</Text>
        <BarChart
          data={sentimentData}
          width={screenWidth}
          height={180}
          barWidth={35}
          noOfSections={5}
          barBorderRadius={4}
          yAxisColor={theme.border}
          xAxisColor={theme.border}
          yAxisTextStyle={{ color: theme.tabIconDefault }}
          xAxisLabelTextStyle={{ color: theme.tabIconDefault }}
          isAnimated
          hideRules
          maxValue={5}
        />
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 32, fontWeight: '800', marginBottom: 20, marginTop: 10, letterSpacing: 0.5 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 20, elevation: 5 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 30 },
});
