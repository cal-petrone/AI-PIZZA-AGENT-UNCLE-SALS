const express = require('express');
const router = express.Router();
const { logCall, getStats, getDailyStats, getDailyCallCounts } = require('./db');

// POST /api/calls/log - Log call data (idempotent by Call SID)
router.post('/log', (req, res) => {
  try {
    const { call_sid, client_slug, call_date, duration_sec, answered, ai_handled } = req.body;
    
    // Validation
    if (!call_sid || !client_slug || !call_date || duration_sec === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Calculate minutes (rounded to 2 decimals)
    const minutes_used = Math.round((duration_sec / 60) * 100) / 100;
    
    // Insert (INSERT OR IGNORE makes it idempotent)
    logCall.run(
      call_sid,
      client_slug,
      call_date,
      parseInt(duration_sec),
      minutes_used,
      answered ? 1 : 0,
      ai_handled !== false ? 1 : 0
    );
    
    res.json({ success: true, message: 'Call logged' });
  } catch (error) {
    console.error('Error logging call:', error);
    res.status(500).json({ error: 'Failed to log call' });
  }
});

// GET /api/calls/stats?client=unclesals - Get usage statistics
router.get('/stats', (req, res) => {
  try {
    const client = req.query.client;
    
    if (!client) {
      return res.status(400).json({ error: 'client parameter required' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get stats for different periods
    const todayStats = getStats.get(client, today) || { total_minutes: 0, call_count: 0 };
    const weekStats = getStats.get(client, weekAgo) || { total_minutes: 0, call_count: 0 };
    const monthStats = getStats.get(client, monthAgo) || { total_minutes: 0, call_count: 0 };
    
    // Get daily breakdown for last 7 days (minutes)
    const dailyData = getDailyStats.all(client);
    
    // Get daily call counts for last 7 days
    const dailyCallData = getDailyCallCounts.all(client);
    
    // Format daily data (fill in missing days with 0)
    const dailyMinutes = [];
    const dailyCalls = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayData = dailyData.find(d => d.call_date === dateStr);
      const callData = dailyCallData.find(d => d.call_date === dateStr);
      dailyMinutes.push({
        date: dateStr,
        minutes: dayData ? (dayData.minutes || 0) : 0
      });
      dailyCalls.push({
        date: dateStr,
        calls: callData ? (callData.call_count || 0) : 0
      });
    }
    
    res.json({
      total_minutes_today: todayStats.total_minutes || 0,
      total_minutes_week: weekStats.total_minutes || 0,
      total_minutes_month: monthStats.total_minutes || 0,
      total_calls_today: todayStats.call_count || 0,
      total_calls_week: weekStats.call_count || 0,
      total_calls_month: monthStats.call_count || 0,
      daily_minutes: dailyMinutes,
      daily_calls: dailyCalls
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;

