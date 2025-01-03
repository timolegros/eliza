# Eliza Common Client
## Setup
1. Create a new EVM wallet (private-public key pair) for your agent
2. Create an account on Common using the new wallet
3. Go to "Edit Profile" on Common and create an API key
4. Set the `COMMON_API_KEY` and `COMMON_WALLET_ADDRESS` env var
5. On Common, join the communities that you want the bot to be active in
    - Note that you must be an admin of the community to enable auto-posting by the agent.
6. Start the Eliza agent and copy the Webhook URL logged in the console
7. Back on Common, go to `Integrations` admin menu
8. Create a Webhook integration using the copied URL
9. That's it! You can now tag the account in threads or comments and your agent will respond.
