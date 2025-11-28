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
   - Prep Time: X minutes
   - Cook Time: X minutes
   - Total Time: X minutes
3. "Servings:" should indicate how many servings (e.g., "6-7 burgers" or "4 servings")
4. Leave the "Notes" section blank
5. List all ingredients with exact measurements in this format:
   - 2 (14-ounce) cans black beans, drained, rinsed, and patted dry
   - 1 Tablespoon extra virgin olive oil
6. "Supplies" should list all non-ingredient materials needed (baking sheets, mixing bowls, measuring spoons, pans, etc.)
7. Instructions should include ingredient amounts inline. For example:
   - Instead of "Whisk together the apricot preserves, soy sauce and garlic"
   - Say "Whisk together the 1/2 cup apricot preserves, 2 tablespoons soy sauce and 3 cloves minced garlic"

OUTPUT FORMAT (use this exact structure):
{
  "name": "Recipe Name Here",
  "content": "# Overview\\nInspo: URL\\nTime:\\n- Prep Time: X minutes\\n- Cook Time: X minutes\\n- Total Time: X minutes\\nServings: X\\n\\n# Notes\\n\\n# Ingredients\\n- ingredient 1\\n- ingredient 2\\n\\n# Supplies\\n- supply 1\\n- supply 2\\n\\n# Instructions\\n1. Step 1\\n2. Step 2"
}

IMPORTANT: 
- Respond ONLY with valid JSON in the exact format above
- Do not include markdown code blocks or any other text
- Use \\n for line breaks in the content string
- Make sure all quotes are properly escaped

HTML:
${html.substring(0, 50000)}`; // Limit HTML length to avoid token limits

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  // Parse Claude's response
  let responseText = message.content[0].text;
  
  // Remove markdown code blocks if present
  responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const extractedData = JSON.parse(responseText);
  
  return extractedData;
}

async function createNotionPage(data) {
  const { name, content } = data;

  // Convert markdown content to Notion blocks
  const blocks = convertMarkdownToNotionBlocks(content);

  const response = await notion.pages.create({
    parent: {
      database_id: process.env.NOTION_DATABASE_ID,
    },
    properties: {
      Name: {
        title: [
          {
            text: {
              content: name,
            },
          },
        ],
      },
    },
    children: blocks,
  });

  return response;
}

function convertMarkdownToNotionBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');
  
  let currentListItems = [];
  let currentListType = null; // 'bulleted' or 'numbered'
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines between sections but preserve them elsewhere
    if (line === '') {
      // Flush any accumulated list items
      if (currentListItems.length > 0) {
        blocks.push(...currentListItems);
        currentListItems = [];
        currentListType = null;
      }
      continue;
    }
    
    // Handle headers
    if (line.startsWith('# ')) {
      // Flush any accumulated list items
      if (currentListItems.length > 0) {
        blocks.push(...currentListItems);
        currentListItems = [];
        currentListType = null;
      }
      
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: line.substring(2),
              },
            },
          ],
        },
      });
      continue;
    }
    
    // Handle bulleted lists
    if (line.startsWith('- ')) {
      // If we were building a numbered list, flush it first
      if (currentListType === 'numbered' && currentListItems.length > 0) {
        blocks.push(...currentListItems);
        currentListItems = [];
      }
      
      currentListType = 'bulleted';
      currentListItems.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: line.substring(2),
              },
            },
          ],
        },
      });
      continue;
    }
    
    // Handle numbered lists
    const numberedMatch = line.match(/^\d+\.\s(.+)/);
    if (numberedMatch) {
      // If we were building a bulleted list, flush it first
      if (currentListType === 'bulleted' && currentListItems.length > 0) {
        blocks.push(...currentListItems);
        currentListItems = [];
      }
      
      currentListType = 'numbered';
      currentListItems.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: numberedMatch[1],
              },
            },
          ],
        },
      });
      continue;
    }
    
    // Regular paragraph - flush any accumulated list items first
    if (currentListItems.length > 0) {
      blocks.push(...currentListItems);
      currentListItems = [];
      currentListType = null;
    }
    
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: line,
            },
          },
        ],
      },
    });
  }
  
  // Flush any remaining list items
  if (currentListItems.length > 0) {
    blocks.push(...currentListItems);
  }
  
  return blocks;
}
