# 🔍 YouTube AI Fact Checker

An AI-powered Chrome Extension that analyzes YouTube video transcripts for bias, factual accuracy, and logical fallacies in real-time.

## ✨ Features

- **Bias Detection:** Analyzes the political or emotional leaning of the video content.
- **Fact Checking:** Cross-references claims made in the video against AI knowledge bases.
- **Privacy Focused:** Your API key is stored locally in your browser and never sent to our servers.
- **Model Selection:** Choose between different Gemini models (e.g., Gemini 1.5 Flash).

## 🚀 Installation

Since this extension is in developer mode, you need to load it manually:

1. Clone this repository or download the ZIP.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Toggle **Developer mode** in the top right corner.
4. Click **Load unpacked**.
5. Select the folder where you downloaded this repository.

## ⚙️ Configuration

1. Click the extension icon (the prism/eye) in your browser toolbar.
2. You will be asked for a **Google Gemini API Key**.
3. Get a free key here: [Google AI Studio](https://aistudio.google.com/app/apikey).
4. Paste the key and click **Save Settings**.

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3
- **Logic:** Vanilla JavaScript (ES6+)
- **AI Provider:** Google Gemini API
- **Platform:** Chrome Extension Manifest V3

## 🏆 Credits

This project stands on the shoulders of giants. Special thanks to:

- **[ajayyy/SponsorBlock](https://github.com/ajayyy/SponsorBlock)** for the groundwork on Chrome Extension injection into YouTube.

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

[MIT](https://choosealicense.com/licenses/mit/)
