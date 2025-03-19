# Perplexica Ask MCP Server


## Tools

- **perplexica_ask**
  - Engage in a conversation with the self-hosted perplexica web searches.
  - **Inputs:**
    - `messages` (array): An array of conversation messages.
      - Each message must include:
        - `role` (string): The role of the message (e.g., `system`, `user`, `assistant`).
        - `content` (string): The content of the message.

## Configuration

### Step 1: 

Clone this repository:

```bash
git clone https://github.com/QuantumBuddha/perplexica-ask.git
```

Navigate to the `perplexity-ask` directory and install the necessary dependencies:

```bash
cd perplexity-ask && npm install
```

### NPX

```json
{
  "mcpServers": {
    "perplexity-ask": {
      "command": "node",
      "args": [
        "-y",
        "server-perplexica-ask"
      ],
      "env": {
        "PERPLEXICA_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.

