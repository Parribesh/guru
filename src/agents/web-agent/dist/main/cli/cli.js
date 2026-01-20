#!/usr/bin/env node
"use strict";
/**
 * CLI tool for interacting with the Electron AI Browser
 * This tool communicates with the running Electron app via IPC
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const net = __importStar(require("net"));
const readline = __importStar(require("readline"));
const CLI_PORT = 9876;
const CLI_HOST = '127.0.0.1';
// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
};
function colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
}
function printHelp() {
    console.log(colorize('\n🤖 AI Browser CLI', 'bright'));
    console.log('==================\n');
    console.log('Commands:');
    console.log('  create <url>              Create a new session with URL');
    console.log('  list                      List all sessions');
    console.log('  ask <sessionId> <question> Ask a question to a session');
    console.log('  chunks <sessionId>         Get chunk count for a session');
    console.log('  workers                   Show worker pool status');
    console.log('  pending                   Show pending chunks');
    console.log('  trigger                   Manually trigger idle workers to process pending chunks');
    console.log('  help                      Show this help message');
    console.log('  exit                      Exit the CLI\n');
    console.log('Examples:');
    console.log('  create file:///path/to/page.html');
    console.log('  list');
    console.log('  ask abc-123 "What is this article about?"\n');
}
function connectToApp() {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.on('connect', () => {
            console.log(colorize('✅ Connected to AI Browser', 'green'));
            resolve(socket);
        });
        socket.on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                console.error(colorize('❌ Could not connect to AI Browser', 'red'));
                console.error('   Make sure the app is running first');
                console.error('   Start it with: npm run dev:start');
            }
            else {
                console.error(colorize(`❌ Connection error: ${err.message}`, 'red'));
            }
            reject(err);
        });
        socket.connect(CLI_PORT, CLI_HOST);
    });
}
function sendCommand(socket, command) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(command) + '\n';
        socket.write(data, (err) => {
            if (err) {
                reject(err);
                return;
            }
        });
        // Wait for response
        const timeout = setTimeout(() => {
            reject(new Error('Command timeout'));
        }, 30000); // 30 second timeout
        socket.once('data', (data) => {
            clearTimeout(timeout);
            try {
                const response = JSON.parse(data.toString());
                resolve(response);
            }
            catch (err) {
                reject(new Error('Invalid response format'));
            }
        });
    });
}
async function handleCommand(socket, command, args) {
    try {
        let cliCommand;
        switch (command) {
            case 'create':
                if (args.length === 0) {
                    console.error(colorize('❌ Usage: create <url>', 'red'));
                    return;
                }
                cliCommand = {
                    type: 'create-session',
                    url: args[0],
                };
                break;
            case 'list':
                cliCommand = {
                    type: 'list-sessions',
                };
                break;
            case 'ask':
                if (args.length < 2) {
                    console.error(colorize('❌ Usage: ask <sessionId> <question>', 'red'));
                    return;
                }
                cliCommand = {
                    type: 'ask-question',
                    sessionId: args[0],
                    question: args.slice(1).join(' '),
                };
                break;
            case 'chunks':
                if (args.length === 0) {
                    console.error(colorize('❌ Usage: chunks <sessionId>', 'red'));
                    return;
                }
                cliCommand = {
                    type: 'get-chunks',
                    sessionId: args[0],
                };
                break;
            case 'embedding':
            case 'embedding-service':
                cliCommand = {
                    type: 'embedding-service-status',
                };
                break;
            case 'help':
                printHelp();
                return;
            case 'exit':
            case 'quit':
                console.log(colorize('👋 Goodbye!', 'cyan'));
                socket.end();
                process.exit(0);
                return;
            default:
                console.error(colorize(`❌ Unknown command: ${command}`, 'red'));
                console.log('Type "help" for available commands');
                return;
        }
        const response = await sendCommand(socket, cliCommand);
        if (response.success) {
            if (response.data) {
                console.log(colorize('✅ Success:', 'green'));
                if (typeof response.data === 'string') {
                    console.log(response.data);
                }
                else if (Array.isArray(response.data)) {
                    response.data.forEach((item, idx) => {
                        console.log(`\n${idx + 1}. ${item.id || item}`);
                        if (item.title)
                            console.log(`   Title: ${item.title}`);
                        if (item.url)
                            console.log(`   URL: ${item.url}`);
                        if (item.state)
                            console.log(`   State: ${item.state}`);
                        if (item.messages)
                            console.log(`   Messages: ${item.messages.length}`);
                    });
                }
                else {
                    console.log(JSON.stringify(response.data, null, 2));
                }
            }
        }
        else {
            console.error(colorize(`❌ Error: ${response.error || 'Unknown error'}`, 'red'));
        }
    }
    catch (error) {
        console.error(colorize(`❌ Command failed: ${error.message}`, 'red'));
    }
}
async function main() {
    const args = process.argv.slice(2);
    // If arguments provided, run as one-shot command
    if (args.length > 0) {
        try {
            const socket = await connectToApp();
            const command = args[0];
            const commandArgs = args.slice(1);
            await handleCommand(socket, command, commandArgs);
            socket.end();
            process.exit(0);
        }
        catch (error) {
            process.exit(1);
        }
        return;
    }
    // Otherwise, run in interactive mode
    console.log(colorize('\n🤖 AI Browser CLI', 'bright'));
    console.log('Type "help" for commands, "exit" to quit\n');
    try {
        const socket = await connectToApp();
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: colorize('ai-browser> ', 'cyan'),
        });
        rl.on('line', async (line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                rl.prompt();
                return;
            }
            const parts = trimmed.split(/\s+/);
            const command = parts[0];
            const commandArgs = parts.slice(1);
            await handleCommand(socket, command, commandArgs);
            rl.prompt();
        });
        rl.on('close', () => {
            console.log(colorize('\n👋 Goodbye!', 'cyan'));
            socket.end();
            process.exit(0);
        });
        rl.prompt();
    }
    catch (error) {
        process.exit(1);
    }
}
main().catch((error) => {
    console.error(colorize(`❌ Fatal error: ${error.message}`, 'red'));
    process.exit(1);
});
//# sourceMappingURL=cli.js.map