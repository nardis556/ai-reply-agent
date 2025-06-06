/**
 * Scraper Control API Routes
 * Handles scraper status, manual refresh, and control operations
 */
import express from 'express';
import fs from 'fs';

const router = express.Router();

// File paths for scraper communication
const CONTROL_FILE = './scraper-control.json';
const STATUS_FILE = './scraper-status.json';

/**
 * GET /api/scraper/status
 * Get current scraper status with enhanced timing info
 */
router.get('/status', async (req, res) => {
    try {
        let status = {
            isRunning: false,
            status: 'unknown',
            message: 'Status file not found',
            remainingSeconds: 0
        };

        if (fs.existsSync(STATUS_FILE)) {
            const statusData = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
            
            // Calculate real-time remaining seconds if sleeping
            if (statusData.status === 'sleeping' && statusData.nextRunTimestamp) {
                const now = Date.now();
                const remaining = Math.max(0, Math.floor((statusData.nextRunTimestamp - now) / 1000));
                statusData.remainingSeconds = remaining;
                
                // If time has passed, status should be ready to run
                if (remaining === 0) {
                    statusData.status = 'ready';
                }
            }
            
            status = statusData;
        }

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error reading scraper status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read scraper status'
        });
    }
});

/**
 * POST /api/scraper/refresh
 * Trigger manual refresh of scraper
 */
router.post('/refresh', async (req, res) => {
    try {
        // Create/update control file to trigger refresh
        const control = {
            forceRefresh: true,
            timestamp: new Date().toISOString(),
            triggeredBy: 'web-interface'
        };

        fs.writeFileSync(CONTROL_FILE, JSON.stringify(control, null, 2));

        console.log('🔄 Manual refresh triggered via API');

        res.json({
            success: true,
            message: 'Manual refresh triggered successfully',
            data: {
                timestamp: control.timestamp,
                action: 'refresh_requested'
            }
        });
    } catch (error) {
        console.error('Error triggering manual refresh:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to trigger manual refresh'
        });
    }
});

/**
 * GET /api/scraper/control
 * Get current control file status
 */
router.get('/control', async (req, res) => {
    try {
        let control = {
            forceRefresh: false,
            message: 'Control file not found'
        };

        if (fs.existsSync(CONTROL_FILE)) {
            const controlData = JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8'));
            control = controlData;
        }

        res.json({
            success: true,
            data: control
        });
    } catch (error) {
        console.error('Error reading control file:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read control file'
        });
    }
});

/**
 * GET /api/scraper/logs
 * Get recent scraper activity (if available)
 */
router.get('/logs', async (req, res) => {
    try {
        // This could be enhanced to read actual log files
        // For now, return basic information
        const logs = {
            message: 'Log viewing not yet implemented',
            suggestion: 'Check terminal output or log files directly'
        };

        res.json({
            success: true,
            data: logs
        });
    } catch (error) {
        console.error('Error reading logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read logs'
        });
    }
});

export default router; 