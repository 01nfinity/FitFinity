import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, ActivityIndicator, RefreshControl } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { fetchLogs } from '../../database/api';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

type LogSet = { exerciseName: string; weight: number | null; reps: number | null; completed: boolean };
type Log = { id: number; date: string; templateName: string | null; sentiment: string | null; sets: LogSet[] };

export default function DashboardScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;

  const screenWidth = Dimensions.get('window').width - 64;

  const [repsData, setRepsData] = useState<any[]>([]);
  const [weightData, setWeightData] = useState<any[]>([]);
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [repsMax, setRepsMax] = useState<number>(100);
  const [weightMax, setWeightMax] = useState<number>(1000);
  const [totalRepsSum, setTotalRepsSum] = useState<number>(0);
  const [totalWeightSum, setTotalWeightSum] = useState<number>(0);
  const [totalWorkoutsSum, setTotalWorkoutsSum] = useState<number>(0);

  const loadStats = async () => {
    try {
      const logs: Log[] = await fetchLogs();

      // "Last 30 days" cutoff, compared as YYYY-MM-DD strings (mirrors the
      // old SQLite `date('now', '-30 days')` comparison).
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const dailyTotals: Record<string, { reps: number; weight: number }> = {};
      let lifetimeReps = 0;
      let lifetimeWeight = 0;

      logs.forEach(log => {
        const datePart = log.date.split(' ')[0];
        (log.sets || []).forEach(s => {
          if (!s.completed) return;
          lifetimeReps += s.reps || 0;
          lifetimeWeight += s.weight || 0;
          if (datePart >= cutoffStr) {
            if (!dailyTotals[datePart]) dailyTotals[datePart] = { reps: 0, weight: 0 };
            dailyTotals[datePart].reps += s.reps || 0;
            dailyTotals[datePart].weight += s.weight || 0;
          }
        });
      });

      const sortedDates = Object.keys(dailyTotals).sort();

      // 1. Reps Data (30 Days)
      if (sortedDates.length > 0) {
        const maxReps = Math.max(...sortedDates.map(d => dailyTotals[d].reps));
        setRepsMax(Math.max(10, Math.ceil(maxReps * 1.35)));
        setRepsData(sortedDates.map(d => ({
          value: dailyTotals[d].reps,
          label: d.split('-').slice(1).join('/'),
          dataPointText: dailyTotals[d].reps.toString(),
        })));
      } else {
        setRepsMax(10);
        setRepsData([{ value: 0, label: 'No Data' }]);
      }

      // 2. Weight Data (30 Days)
      if (sortedDates.length > 0) {
        const maxWeight = Math.max(...sortedDates.map(d => dailyTotals[d].weight));
        setWeightMax(Math.max(100, Math.ceil(maxWeight * 1.35)));
        setWeightData(sortedDates.map(d => ({
          value: dailyTotals[d].weight,
          label: d.split('-').slice(1).join('/'),
          dataPointText: dailyTotals[d].weight >= 1000 ? (dailyTotals[d].weight / 1000).toFixed(1) + 'k' : dailyTotals[d].weight.toString(),
        })));
      } else {
        setWeightMax(100);
        setWeightData([{ value: 0, label: 'No Data' }]);
      }

      // 3. Sentiment Data (Last 5 unique workouts)
      const withSentiment = logs
        .filter(l => l.sentiment != null)
        .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.id - a.id))
        .slice(0, 5);

      if (withSentiment.length > 0) {
        const sentimentEmojis: Record<string, string> = { '1': '😭', '2': '🙁', '3': '😐', '4': '🙂', '5': '😆' };
        setSentimentData(withSentiment.reverse().map((l, idx) => ({
          value: parseInt(l.sentiment as string),
          label: (l.templateName || 'Custom').split(' ')[0], // First word of routine
          frontColor: idx % 2 === 0 ? theme.tint : theme.accent,
          topLabelComponent: () => (
            <Text style={{ color: theme.text, fontSize: 16, marginBottom: 4 }}>
              {sentimentEmojis[l.sentiment as string] || ''}
            </Text>
          ),
          showValuesAsTopLabel: true,
        })));
      } else {
        setSentimentData([{ value: 0, label: 'N/A' }]);
      }

      // 4. Lifetime Stats
      setTotalRepsSum(lifetimeReps);
      setTotalWeightSum(lifetimeWeight);
      setTotalWorkoutsSum(logs.length);

      setRefreshKey(prev => prev + 1);

    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadStats();
  };

  useAutoRefresh(loadStats);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.tint} />}
    >
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
