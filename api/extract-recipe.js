import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@notionhq/client';

// Initialize clients
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Recipe URL is required' });
  }

  try {
    // Step 1: Fetch the recipe webpage
    console.log('Fetching recipe from:', url);
    const response = await fetch(url);
    const html = await response.text();

    // Step 2: Extract recipe data using Claude
    console.log('Extracting recipe data with Claude...');
    const extractedData = await extractRecipeWithClaude(html, url);

    // Step 3: Create Notion page
    console.log('Creating Notion page...');
    const notionPage = await createNotionPage(extractedData);

    return res.status(200).json({
      success: true,
      notionUrl: notionPage.url,
      recipeName: extractedData.name,
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Failed to process recipe',
      details: error.message,
    });
  }
}

async function extractRecipeWithClaude(html, recipeUrl) {
  const prompt = `Extract the recipe information from this HTML and format it according to these exact rules:

RULES:
1. "Inspo:" should be followed by the URL: ${recipeUrl}
2. "Time:" should indicate prep time, cook time, and total time in this format:
   - Pr
