# Gmail CLI

A command-line interface for Gmail.

## Features

- 🔐 OAuth2 authentication
- 👥 Multi-profile support (multiple Gmail accounts)
- 📧 Send emails with attachments (text/HTML)
- 💬 Reply to emails with proper threading
- 🔍 Search emails using Gmail search syntax
- 📎 Download attachments
- 🏷️ Manage email labels
- 📋 List labels
- 📤 JSON export for scripting
- 🎨 Beautiful colored output

## Installation

Install globally to use the `gmail` command anywhere:

```bash
npm install -g simple-gmail-cli
```

## Configuration

### 1. Get Google Cloud credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing one)
3. Enable Gmail API
4. Create OAuth 2.0 credentials (Desktop app)
5. Download credentials as JSON

### 2. Set up configuration

Create config directory:

```bash
mkdir -p ~/.config/gmail
```

Create `~/.config/gmail/config.json`:

```json
{
  "profiles": {
    "default": {
      "GMAIL_OAUTH_PATH": "/path/to/client_secret_xxx.json"
    }
  }
}
```

Where `GMAIL_OAUTH_PATH` points to the OAuth client credentials JSON file you downloaded from Google Cloud Console (contains `client_id`, `client_secret`, etc.).

#### Multiple profiles

You can configure multiple Gmail accounts by adding more profiles:

```json
{
  "profiles": {
    "default": {
      "GMAIL_OAUTH_PATH": "/path/to/personal_client_secret.json"
    },
    "work": {
      "GMAIL_OAUTH_PATH": "/path/to/work_client_secret.json"
    }
  }
}
```

Each profile can use a different Google Cloud OAuth app, allowing complete separation between accounts.

### 3. Authenticate

```bash
gmail auth login
```

This will:
- Open your browser for authorization
- Start a local server to capture the OAuth callback
- Save the token to `~/.config/gmail/{profile}.token.json`

For other profiles, use the `--profile` option:

```bash
gmail --profile work auth login
```

## Usage

### Global Options

```bash
--profile <name>   Profile to use (default: "default")
--version          Show version number
--help             Show help
```

All commands support the `--profile` option:

```bash
gmail --profile work email search "is:unread"
gmail --profile work auth status
```

### Authentication

```bash
# Login (default profile)
gmail auth login

# Login with specific profile
gmail --profile work auth login

# Check status
gmail auth status

# Logout
gmail auth logout
```

### Email Management

#### Search emails
```bash
gmail email search "from:example@gmail.com"
gmail email search "subject:invoice is:unread"
gmail email search "has:attachment" --max-results 20
```

Options:
- `--max-results <n>` - Maximum number of results to return (default: 10)
- `--json` - Output in JSON format

#### View email
```bash
gmail email view <messageId>
gmail email view <messageId> --json
```

#### Send email
```bash
# Simple text email
gmail email send user@example.com --subject "Hello" --bodyTxt "This is a test"

# HTML email
gmail email send user@example.com --subject "Report" --bodyHtml "<h1>Monthly Report</h1>"

# With attachments
gmail email send user@example.com \
  --subject "Files" \
  --bodyTxt "See attached" \
  --attach report.pdf \
  --attach image.jpg

# With CC and BCC
gmail email send user@example.com \
  --subject "Meeting" \
  --bodyTxt "Meeting notes attached" \
  --cc colleague@example.com \
  --bcc manager@example.com \
  --attach notes.pdf
```

#### Reply to email
```bash
# Simple reply
gmail email reply <messageId> --bodyTxt "Thanks for your email"

# Reply with attachment
gmail email reply <messageId> --bodyHtml "<p>See attached</p>" --attach response.pdf

# Reply with quoted original
gmail email reply <messageId> --bodyTxt "I agree" --quote
```

### Attachment Management

#### List attachments in a message
```bash
gmail attachment list <messageId>
gmail attachment list <messageId> --json
```

#### Download attachment
```bash
gmail attachment download <attachmentId> \
  --message-id <messageId> \
  --out output/file.pdf
```

### Label Management

#### List all labels
```bash
gmail label list
gmail label list --json
```

#### Add label to email
```bash
gmail email label add <messageId> "Work"
gmail email label add <messageId> "Follow Up"
```

#### Remove label from email
```bash
gmail email label remove <messageId> "Important"
```

### Gmail Superstar Labels

Gmail supports special "Superstar" labels (colored stars and icons) that can be used to organize emails. These labels use different identifiers for searching vs. adding/removing via the API.

> **Note:** Adding a Superstar label automatically adds the `STARRED` label. Conversely, removing the `STARRED` label automatically removes any Superstar labels from the email.

#### Superstar Reference Table

| Name | Search Label | API Label | Icon |
|------|--------------|-----------|------|
| Yellow Star | `^ss_sy` | `YELLOW_STAR` | ⭐ |
| Orange Star | `^ss_so` | `ORANGE_STAR` | 🟠 |
| Red Star | `^ss_sr` | `RED_STAR` | 🔴 |
| Purple Star | `^ss_sp` | `PURPLE_STAR` | 🟣 |
| Blue Star | `^ss_sb` | `BLUE_STAR` | 🔵 |
| Green Star | `^ss_sg` | `GREEN_STAR` | 🟢 |
| Red Bang | `^ss_cr` | `RED_CIRCLE` | ❗ |
| Orange Guillemet | `^ss_co` | `ORANGE_GUILLEMET` | » |
| Yellow Guillemet | `^ss_cy` | `YELLOW_GUILLEMET` | » |
| Green Check | `^ss_cg` | `GREEN_CHECK` | ✓ |
| Blue Info | `^ss_cb` | `BLUE_INFO` | ℹ |
| Purple Question | `^ss_cp` | `PURPLE_QUESTION` | ? |

#### Search for emails with a Superstar
```bash
# Find emails with Red Bang
gmail email search "label:^ss_cr"

# Find unread emails with Green Check in inbox
gmail email search "label:^ss_cg label:inbox is:unread"
```

#### Add a Superstar to an email
```bash
# Add Red Bang to an email
gmail email label add <messageId> RED_CIRCLE

# Add Green Check
gmail email label add <messageId> GREEN_CHECK
```

#### Remove a Superstar from an email
```bash
# Remove Red Bang
gmail email label remove <messageId> RED_CIRCLE
```

## Examples

### Complete workflow

```bash
# Search for unread emails
gmail email search "is:unread" --max-results 5

# View a specific email
gmail email view 18a2b3c4d5e6f7g8

# Reply to the email
gmail email reply 18a2b3c4d5e6f7g8 --bodyTxt "Thanks, I'll review this"

# Add a label
gmail email label add 18a2b3c4d5e6f7g8 "Processed"
```

### Send email with both text and HTML versions

```bash
gmail email send user@example.com \
  --subject "Newsletter" \
  --bodyTxt "Plain text version for email clients that don't support HTML" \
  --bodyHtml "<h1>HTML Newsletter</h1><p>Rich content here</p>"
```

### Download all attachments from an email

```bash
# First, list attachments
gmail attachment list 18a2b3c4d5e6f7g8

# Then download each one
gmail attachment download abc123 --message-id 18a2b3c4d5e6f7g8 --out file1.pdf
gmail attachment download def456 --message-id 18a2b3c4d5e6f7g8 --out file2.jpg
```

## Output Formats

Most commands support `--json` flag for machine-readable output:

```bash
gmail email search "is:unread" --json | jq '.[] | .id'
gmail label list --json | jq '.[] | select(.type=="user") | .name'
```

## Technical Details

### Dependencies

- `commander` - CLI framework
- `googleapis` - Google APIs client
- `google-auth-library` - OAuth2 authentication
- `nodemailer` - MIME message construction
- `mime-types` - MIME type detection
- `chalk` - Colored terminal output
- `ora` - Loading spinners

### Gmail API Scopes

The CLI requires the following scopes:
- `gmail.send` - Send emails
- `gmail.readonly` - Read emails
- `gmail.labels` - Read labels
- `gmail.modify` - Modify emails (add/remove labels)

### Limitations

- Maximum message size: 35MB (Gmail API limit)
- Attachment validation performed before sending
- Label operations use display names (automatically resolved to IDs)

## Troubleshooting

### Authentication errors

```bash
# Check authentication status
gmail auth status

# Re-authenticate if needed
gmail auth login
```

### File not found errors

Ensure file paths are correct (use absolute paths or relative to current directory):

```bash
gmail email send user@example.com --subject "Test" --bodyTxt "Test" --attach ./report.pdf
```

### Label not found

Use `gmail label list` to see all available labels:

```bash
gmail label list
```

## License

MIT License
