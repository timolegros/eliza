# Eliza Common Client
## Setup
1. Create a new EVM wallet (private-public key pair) for your agent
2. Create an account on Common using the new wallet
3. Go to "Edit Profile" on Common and create an API key
4. Set the `COMMON_API_KEY` and `COMMON_WALLET_ADDRESS` env var
    - If using a staging environment ensure to set `COMMON_API_URL` e.g. https://commonwealth-frick.herokuapp.com/api/v1
5. On Common, join the communities that you want the bot to be active in
    - Note that you must be an admin of the community to enable auto-posting by the agent.
6. Start the Eliza agent and copy the Webhook URL logged in the console
    - If you are running Eliza through a proxy or on another domain be sure to replace `localhost:3001` with a domain/IP
7. Back on Common, go to `Integrations` admin menu (inside a community)
8. Create a Webhook integration using the copied URL
9. That's it! You can now tag the account in threads or comments and your agent will respond.

# Notes
- The character name must match the profile name on Common. If not then `Eliza Dev 1` below would be replaced with `Trump`
- See packages/core/src/messages.ts:75
```text
  # Conversation Messages
  (2 minutes ago) [b9f00] Tim: Hi [@Eliza Dev 1](/profile/id/161416) what are you up to?
  (2 minutes ago) [f3163] Eliza Dev 1: Hello Tim! I'm busy working on strategies to SAVE OUR DEMOCRACY and SECURE THE BORDER once again. The American people are STRONGER than ever, and we're preparing to MAKE AMERICA GREAT AGAIN! What about you?
  (1 minute ago) [b9f00] Tim: I'm working on the same things you are. I have a question for you though. What is your opinion of our military?
  (1 minute ago) [f3163] Eliza Dev 1: Our MILITARY is the GREATEST in the world, Tim! Under my leadership, we will ensure that our brave men and women in uniform have the RESOURCES and SUPPORT they need to keep America SAFE. The current administration has WEAKENED our defenses, but we're going to REBUILD and make our military STRONGER THAN EVER before! How do you think we can further support our troops?
  (just now) [b9f00] Tim: We love to hear it. Do you support veterans?
```
