import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { LineChart, BarChart } from 'react-native-gifted-charts';
// import { useSQLiteContext } from 'expo-sqlite';
import { useIsFocused } from '@react-navigation/native';

export default function DashboardScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const db: any = { getAllAsync: async () => [], runAsync: async () => {}, getFirstAsync: async () => null, execAsync: async () => {} };
  const isFocused = useIsFocused();

  const screenWidth = Dimensions.get('window').width - 64;

  const [repsData, setRepsData] = useState<any[]>([]);
  const [weightData, setWeightData] = useState<any[]>([]);
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [repsMax, setRepsMax] = useState<number>(100);
  const [weightMax, setWeightMax] = useState<number>(1000);
  const [totalRepsSum, setTotalRepsSum] = useState<number>(0);
  const [totalWeightSum, setTotalWeightSum] = useState<number>(0);
  const [totalWorkoutsSum, setTotalWorkoutsSum] = useState<number>(0);

  const loadStats = async () => {
    try {
      // 1. Reps Data (30 Days)
      const repsRows = await db.getAllAsync<{ date: string; total: number }>(`
        SELECT substr(date, 1, 10) as date, SUM(reps) as total 
        FROM logs 
        JOIN log_sets ON logs.id = log_sets.log_id 
        WHERE substr(date, 1, 10) >= date('now', '-30 days') 
          AND log_sets.completed = 1
        GROUP BY substr(date, 1, 10) 
        ORDER BY date ASC
      `);
      
      let maxReps = 0;
      if (repsRows.length > 0) {
        maxReps = Math.max(...repsRows.map(r => r.total));
        setRepsMax(Math.max(10, Math.ceil(maxReps * 1.35)));
        setRepsData(repsRows.map(r => ({ 
          value: r.total, 
          label: r.date.split(' ')[0].split('-').slice(1).join('/'),
          dataPointText: r.total.toString() 
        })));
      } else {
        setRepsMax(10);
        setRepsData([{value: 0, label: 'No Data'}]);
      }

      // 2. Weight Data (30 Days)
      const weightRows = await db.getAllAsync<{ date: string; total: number }>(`
        SELECT substr(date, 1, 10) as date, SUM(weight) as total 
        FROM logs 
        JOIN log_sets ON logs.id = log_sets.log_id 
        WHERE substr(date, 1, 10) >= date('now', '-30 days') 
          AND log_sets.completed = 1
        GROUP BY substr(date, 1, 10) 
        ORDER BY date ASC
      `);
      
      let maxWeight = 0;
      if (weightRows.length > 0) {
        maxWeight = Math.max(...weightRows.map(r => r.total));
        setWeightMax(Math.max(100, Math.ceil(maxWeight * 1.35)));
        setWeightData(weightRows.map(r => ({ 
          value: r.total, 
          label: r.date.split(' ')[0].split('-').slice(1).join('/'),
          dataPointText: r.total >= 1000 ? (r.total / 1000).toFixed(1) + 'k' : r.total.toString()
        })));
      } else {
        setWeightMax(100);
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

      // 4. Lifetime Stats
      const repsTotalRow = await db.getFirstAsync<{ total: number | null }>(`
        SELECT SUM(reps) as total FROM log_sets WHERE completed = 1
      `);
      const weightTotalRow = await db.getFirstAsync<{ total: number | null }>(`
        SELECT SUM(weight) as total FROM log_sets WHERE completed = 1
      `);
      const workoutsTotalRow = await db.getFirstAsync<{ total: number | null }>(`
        SELECT COUNT(*) as total FROM logs
      `);

      setTotalRepsSum(repsTotalRow?.total || 0);
      setTotalWeightSum(weightTotalRow?.total || 0);
      setTotalWorkoutsSum(workoutsTotalRow?.total || 0);

      setRefreshKey(prev => prev + 1);

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

      <View style={styles.statsGrid}>
        <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.tabIconDefault }]}>Total Reps</Text>
          <Text style={[styles.statValue, { color: theme.tint }]} numberOfLines={1} adjustsFontSizeToFit>{totalRepsSum.toLocaleString()}</Text>
        </View>

        <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.tabIconDefault }]}>Total Weight</Text>
          <Text style={[styles.statValue, { color: theme.accent }]} numberOfLines={1} adjustsFontSizeToFit>{totalWeightSum.toLocaleString()} lbs</Text>
        </View>

        <View style={[styles.statTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.tabIconDefault }]}>Workouts</Text>
          <Text style={[styles.statValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>{totalWorkoutsSum.toLocaleString()}</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Total Reps (30 Days)</Text>
        <LineChart
          key={`reps-${refreshKey}`}
          data={repsData}
          maxValue={repsMax}
          width={screenWidth}
          height={180}
          color={theme.tint}
          thickness={3}
          dataPointsColor={theme.tint}
          hideRules
          yAxisColor={theme.border}
          xAxisColor={theme.border}
          yAxisLabelWidth={55}
          yAxisTextStyle={{ color: theme.tabIconDefault, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: theme.tabIconDefault }}
          curved
          isAnimated
          showValuesAsDataPointsText
          initialSpacing={30}
          endSpacing={35}
          textColor={theme.text}
          textFontSize={10}
          textShiftY={-10}
          noOfSections={5}
          yAxisExtraHeight={25}
          formatYLabel={(val) => Math.round(Number(val)).toString()}
        />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>Total Weight (30 Days, lbs)</Text>
        <LineChart
          key={`weight-${refreshKey}`}
          data={weightData}
          maxValue={weightMax}
          width={screenWidth}
          height={180}
          color={theme.accent}
          thickness={3}
          dataPointsColor={theme.accent}
          hideRules
          yAxisColor={theme.border}
          xAxisColor={theme.border}
          yAxisLabelWidth={55}
          yAxisTextStyle={{ color: theme.tabIconDefault, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: theme.tabIconDefault }}
          curved
          isAnimated
          showValuesAsDataPointsText
          initialSpacing={30}
          endSpacing={35}
          textColor={theme.text}
          textFontSize={10}
          textShiftY={-10}
          noOfSections={5}
          yAxisExtraHeight={25}
          formatYLabel={(val) => Math.round(Number(val)).toString()}
        />
      </View>

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>How I Feel (Last 5)</Text>
        <BarChart
          key={`sentiment-${refreshKey}`}
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
          yAxisExtraHeight={30}
          formatYLabel={(val) => Math.round(Number(val)).toString()}
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
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
  },
  statTile: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
});
