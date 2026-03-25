# Ai Doesn't Have to Suck

LLMs are dumb - albeit vast and surprisingly accurate - next-word predictors.

On their own, they're interesting, but necessarily very impressive or useful.

They need a _harness_, and _skills_ to be useful - which is to say that you take their base 50% accuracy and run it in a loop with hand-picked context, and let them try a few times until they get it right.

Oh, and you give them a special machine-parsable _tool_ vocabulary that the _harness_ can run and then provide feedback.

# Get Started Right

Not that there's one _right_ way, but here's an easy path:

1. Install Ollama: https://ollama.com/download
2. Get Ollama Cloud: https://ollama.com/pricing
    - Gives you access to GLM, Kimi-K, Minimax, etc (like Opus / Sonnet / Haiku)
    - Free is enough to try, $20/month will get you far
3. Sign in
    ```sh
    ollama signin
    ```
4. Install Node, OpenCode & Claude CLI

    ```sh
    curl -sS https://webi.sh/node@lts | sh
    source ~/.config/envman/PATH.env

    cd /tmp
    npm install --location=global opencode-ai
    npm install --location=global @anthropic-ai/claude-code
    ```

5. Launch GLM-5 and ask it to install these skills
    ```sh
    ollama launch
    # down arrow to OpenCode
    # right arrow to select models
    # hit enter on glm-5
    ```
    ```text
    Clone https://github.com/therootcompany/skills to ~/Agents/skills and use agent-init touse the walk me through agent initialization.
    ```
