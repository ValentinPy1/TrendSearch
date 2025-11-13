# Supabase MCP Setup Guide

This project includes a Supabase Model Context Protocol (MCP) server configuration that allows Cursor AI to interact directly with your Supabase database.

## Prerequisites

- A Supabase account and project
- Cursor IDE installed

## Setup Instructions

### Step 1: Generate a Personal Access Token (PAT)

1. Log in to your Supabase account
2. Navigate to **Account Settings** > **Access Tokens**
   - You can find this at: https://supabase.com/dashboard/account/tokens
3. Click **Create New Token**
4. Provide a descriptive name (e.g., "MCP Server Access")
5. Copy the generated token and store it securely

### Step 2: Configure Environment Variables

Add the following environment variable to your `.env` file:

```env
# Supabase MCP Configuration
SUPABASE_ACCESS_TOKEN=your_personal_access_token_here
```

**Important:** Replace `your_personal_access_token_here` with the PAT you generated in Step 1.

### Step 3: Configure Cursor MCP Settings

The MCP configuration file is already created at `.cursor/mcp.json`. However, you need to configure Cursor to use it:

1. Open Cursor Settings (Cmd/Ctrl + ,)
2. Navigate to **Features** > **Model Context Protocol**
3. Ensure MCP is enabled
4. The configuration should automatically pick up the `.cursor/mcp.json` file

Alternatively, you can manually configure it in Cursor's settings JSON:

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp",
      "env": {
        "SUPABASE_ACCESS_TOKEN": "your_personal_access_token_here"
      }
    }
  }
}
```

### Step 4: Optional Configuration Options

You can customize the MCP server behavior by adding query parameters to the URL:

#### Project Scoping
To restrict access to a specific Supabase project:

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF",
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

Replace `YOUR_PROJECT_REF` with your project's reference ID (found in your Supabase project URL).

#### Read-Only Mode
To limit operations to read-only:

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?read_only=true",
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

#### Feature Groups
To customize available tools:

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?features=database,docs",
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

Available feature groups: `database`, `docs`, `storage`, `auth`, `functions`

### Step 5: Verify the Setup

1. Restart Cursor IDE
2. Open a chat with the AI assistant
3. Try asking questions about your Supabase database, such as:
   - "What tables are in my Supabase database?"
   - "Show me the schema of the users table"
   - "Query the keywords table for the top 10 keywords by volume"

## Troubleshooting

### MCP Server Not Connecting

1. **Check your PAT**: Ensure your Personal Access Token is valid and not expired
2. **Verify environment variables**: Make sure `SUPABASE_ACCESS_TOKEN` is set correctly
3. **Check Cursor logs**: Look for MCP-related errors in Cursor's developer console
4. **Restart Cursor**: Sometimes a restart is needed after configuration changes

### Permission Issues

- Ensure your PAT has the necessary permissions for the operations you want to perform
- If using read-only mode, you won't be able to modify data
- Check your Supabase project's RLS (Row Level Security) policies

### Alternative: Local MCP Server

If you prefer to run a local MCP server instead of using the hosted one:

1. Clone the Supabase MCP repository:
   ```bash
   git clone https://github.com/supabase-community/supabase-mcp.git
   cd supabase-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_service_role_key
   ```

4. Build and start the server:
   ```bash
   npm run build
   npm start
   ```

5. Update `.cursor/mcp.json` to point to your local server:
   ```json
   {
     "mcpServers": {
       "supabase": {
         "url": "http://localhost:8080/mcp"
       }
     }
   }
   ```

## Security Notes

- **Never commit your PAT to version control**: Always use environment variables
- **Use read-only mode for production**: If you only need to query data, enable read-only mode
- **Scope to specific projects**: Use the `project_ref` parameter to limit access to specific projects
- **Rotate tokens regularly**: Generate new PATs periodically and revoke old ones

## Resources

- [Supabase MCP GitHub Repository](https://github.com/supabase-community/supabase-mcp)
- [Supabase MCP Documentation](https://github.com/supabase-community/supabase-mcp#readme)
- [Cursor MCP Documentation](https://docs.cursor.com/mcp)

## Current Project Configuration

This project uses the following Supabase configuration:
- **Project URL**: Set via `SUPABASE_URL` environment variable
- **Service Role Key**: Set via `SUPABASE_SERVICE_ROLE_KEY` environment variable
- **Database URL**: Set via `DATABASE_URL` environment variable

The MCP server will use your Personal Access Token to authenticate, which is separate from the service role key used by your application.

