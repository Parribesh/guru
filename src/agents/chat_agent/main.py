from chat_agent.api.api import app
import uvicorn
import ollama
import threading
import subprocess

def start_ollama_server():
    subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if __name__ == "__main__":
    threading.Thread(target=start_ollama_server).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)