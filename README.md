# Recipe Extractor for Notion

Extracts recipes from URLs and adds them to your Notion recipes database.

## Setup

1. Clone this repo
2. Run `npm install`
3. Add environment variables in Vercel:
   - `ANTHROPIC_API_KEY` - Your Claude API key
   - `NOTION_API_KEY` - Your Notion integration token
   - `NOTION_DATABASE_ID` - Your recipes database ID
4. Deploy to Vercel
5. Use the iOS Shortcut to send recipe URLs

## Usage

Send a POST request to your Vercel function URL:
```
https://your-project.vercel.app/api/extract-recipe
```

Body:
```json
{
  "url": "https://example.com/recipe"
}
```

## iOS Shortcut Setup

1. Create a new Shortcut
2. Add "Receive URLs from Share Sheet"
3. Add "Get Contents of URL" action:
   - URL: `https://your-project.vercel.app/api/extract-recipe`
   - Method: POST
   - Request Body: JSON
   - Add key "url" with value from step 2
4. Add "Show Notification" with the result

Now you can share any recipe URL from Safari → Your Shortcut → Recipe added to Notion!
