/**
 * Test script to fetch jobs from API and log their structure
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || 'http://127.0.0.1:8000';

async function fetchJobs() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${EMBEDDING_SERVICE_URL}/api/embeddings/jobs?limit=5`);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: 'GET',
      timeout: 5000,
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve(Array.isArray(json) ? json : (json.jobs || []));
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function fetchJobDetails(jobId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${EMBEDDING_SERVICE_URL}/api/embeddings/job/${jobId}`);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      timeout: 5000,
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

(async () => {
  try {
    console.log('Fetching jobs from:', EMBEDDING_SERVICE_URL);
    const jobs = await fetchJobs();
    console.log(`\nFound ${jobs.length} jobs\n`);
    
    if (jobs.length > 0) {
      console.log('Sample job from list:');
      console.log(JSON.stringify(jobs[0], null, 2));
      
      // Fetch full details for first job
      if (jobs[0].job_id) {
        console.log(`\n\nFetching full details for job: ${jobs[0].job_id}`);
        const jobDetails = await fetchJobDetails(jobs[0].job_id);
        console.log('\nFull job details:');
        console.log(JSON.stringify(jobDetails, null, 2));
        
        console.log('\n\nExecution time fields:');
        console.log('execution_time_sec:', jobDetails.execution_time_sec);
        console.log('job_metrics?.execution_time_sec:', jobDetails.job_metrics?.execution_time_sec);
        console.log('duration_ms:', jobDetails.duration_ms);
      }
    } else {
      console.log('No jobs found');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();

