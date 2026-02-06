# Sanatana Critique

An AI-powered platform for critical analysis of ancient religious texts, examining them through modern ethical lenses.

## Architecture Overview

### Core Philosophy
This is an **intelligent, scalable system** that leverages modern AI to:
1. Parse uploaded religious texts automatically (no manual data entry)
2. Extract structure (chapters, verses) using LLMs
3. Generate multi-perspective critical analysis
4. Enable semantic search across texts
5. Provide browsable, filterable interface

### Tech Stack

**Frontend:**
- Next.js 15 with App Router
- TypeScript
- Tailwind CSS
- React Server Components

**Backend:**
- Vercel Serverless Functions
- PostgreSQL/Neon (with pgvector for semantic search)
- Background job processing

**AI/ML:**
- OpenAI GPT-4o / GPT-4o-mini for parsing & analysis
- Anthropic Claude 3.5 Sonnet/Haiku (alternative)
- text-embedding-3-small for semantic search

### Data Flow

```
1. Upload Document (PDF/TXT/JSON)
   ↓
2. AI Parsing (extract structure: chapters → verses)
   ↓
3. Store in Database
   ↓
4. Background Analysis Job
   ↓
5. Generate embeddings for semantic search
   ↓
6. Browse/Search/Filter UI
```

## Project Structure

```
sanatana-critique/
├── app/
│   ├── api/
│   │   ├── upload/         # Document upload endpoint
│   │   ├── process/        # Trigger parsing job
│   │   └── analyze/        # Trigger analysis job
│   ├── browse/             # Browse books & verses
│   ├── upload/             # Upload UI
│   └── search/             # Search interface
├── components/
│   ├── upload/             # File upload components
│   ├── analysis/           # Analysis display
│   └── browse/             # Book/chapter browser
├── lib/
│   ├── ai-service.ts       # LLM integration layer
│   ├── db.ts               # Database abstraction
│   └── queue.ts            # Background job processor
└── types/
    └── index.ts            # TypeScript definitions
```

## Key Features

### 1. AI-Powered Document Parsing
- Upload any religious text (Bhagavad Gita, Manusmriti, Bible, etc.)
- LLM automatically extracts:
  - Book metadata (title, era, language, author)
  - Chapter/section structure
  - Individual verses/paragraphs
  - Translations & transliterations
  - Speaker identification (for dialogues)

### 2. Multi-Perspective Analysis
Each verse is analyzed through:
- **Modern Ethics**: Compatibility with 2026 ethical standards
- **Gender Analysis**: Treatment of women, gender roles, restrictions
- **Caste Analysis**: Hierarchies, discrimination, social divisions
- **Contradictions**: Logical inconsistencies
- **Historical Context**: Context vs. modern applicability

### 3. Problematic Scoring
- AI assigns score (0-10) for each verse
- Higher scores = more problematic from modern perspective
- Aggregate statistics at book level

### 4. Semantic Search
- Vector embeddings for natural language queries
- Find verses by concept, not just keywords
- Cross-reference similar problematic passages

### 5. Tagging System
- Auto-generated tags: #misogyny #casteism #violence #slavery
- Filter and browse by tags
- Track recurring themes

## Database Schema

See `lib/db.ts` for full SQL schema. Key tables:
- `documents` - Uploaded files
- `books` - Parsed book metadata
- `chapters` - Chapter/section data
- `verses` - Individual verses with embeddings
- `analyses` - AI-generated critical analysis
- `processing_jobs` - Background job tracking

## API Endpoints

### POST /api/upload
Upload a document for processing
```json
{
  "file": File,
  "metadata": {
    "title": "Optional title",
    "language": "Sanskrit",
    "era": "400 BCE"
  }
}
```

### POST /api/process
Parse uploaded document
```json
{
  "documentId": "uuid",
  "customInstructions": "Optional parsing instructions"
}
```

### POST /api/analyze
Analyze parsed book
```json
{
  "bookId": "uuid",
  "config": {
    "model": "gpt-4o-mini",
    "perspectives": ["modern_ethics", "gender", "caste"],
    "generateEmbeddings": true,
    "batchSize": 10
  }
}
```

### GET /api/jobs/:jobId
Check processing job status

### GET /api/search
Search verses
```
?query=women&minScore=7&perspectives=gender
```

## Development Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

Add your API keys:
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://...
```

3. Run database migrations (if using Postgres):
```bash
npm run db:migrate
```

4. Start development server:
```bash
npm run dev
```

## Cost Optimization

### Minimize LLM Costs
- Use GPT-4o-mini for analysis ($0.15/1M input tokens)
- Use GPT-4o only for complex parsing
- Batch process in groups of 10-20
- Cache all results in database
- Pre-generate analyses (one-time cost)

### Estimated Costs
**Initial Setup (Bhagavad Gita - 700 verses):**
- Parsing: ~$1
- Analysis (all verses): ~$8-10
- Embeddings: ~$0.50
- **Total: ~$10-12**

**Monthly Operating (moderate traffic):**
- User queries: ~$5-10
- Hosting (Vercel): $0-20
- Database (Neon): $0-25
- **Total: $5-55/month**

## Deployment

### Step 1: Set Up Neon Database

1. **Create Neon Account:**
   - Go to [neon.tech](https://neon.tech)
   - Sign up with GitHub

2. **Create New Project:**
   - Click "New Project"
   - Set project name: `sanatana-critique`
   - Choose region closest to your users
   - Click "Create project"

3. **Get Database Connection String:**
   - Go to Dashboard → Connection Details
   - Copy the connection string (starts with `postgresql://`)
   - Example: `postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb`

4. **Enable pgvector Extension:**
   - Run in SQL Editor: `CREATE EXTENSION IF NOT EXISTS vector;`

5. **Run Database Migrations:**
   - Copy the SQL schema from `lib/db.ts`
   - Run in Neon SQL Editor
   - Or use the init script:
     ```bash
     npm run db:init
     ```

### Step 2: Deploy to Vercel

#### Option 1: GitHub Integration (Recommended)

1. **Push code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/sanatana-critique.git
   git push -u origin main
   ```

2. **Deploy via Vercel Dashboard:**
   - Go to [vercel.com](https://vercel.com) and sign in
   - Click "Add New" → "Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js settings
   - **Before clicking Deploy**, add environment variables:

3. **Configure Environment Variables:**
   - In the import screen, expand "Environment Variables"
   - Add these variables:
     ```
     OPENAI_API_KEY=sk-...
     ANTHROPIC_API_KEY=sk-ant-...
     DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb
     ```

4. **Deploy:**
   - Click "Deploy"
   - Wait 1-2 minutes for build to complete
   - Your app will be live at `https://your-project.vercel.app`

5. **Automatic Deployments:**
   - Every push to `main` branch auto-deploys to production
   - Pull requests get preview deployments automatically

#### Option 2: Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   # First deployment (preview)
   vercel
   
   # Production deployment
   vercel --prod
   ```

4. **Set environment variables:**
   ```bash
   vercel env add OPENAI_API_KEY production
   vercel env add ANTHROPIC_API_KEY production
   vercel env add DATABASE_URL production
   ```

### Step 3: Post-Deployment

1. **Verify Database Connection:**
   - Check Vercel deployment logs
   - Test API endpoints
   - Verify Neon connection in Dashboard → Connections

2. **Custom Domain (Optional):**
   - Vercel Dashboard → Project → Settings → Domains
   - Add your domain and configure DNS records

3. **Monitor:**
   - **Vercel Logs:** Dashboard → Deployments → Runtime Logs
   - **Neon Logs:** Dashboard → Monitoring
   - **Analytics:** Vercel Analytics tab

### Troubleshooting

**Build fails:**
- Check Vercel build logs
- Verify all environment variables are set
- Ensure `package.json` scripts are correct

**Database connection errors:**
- Verify DATABASE_URL is correct
- Check Neon project is active
- Ensure pgvector extension is enabled
- Check connection pooling settings

**API rate limits:**
- Monitor OpenAI/Anthropic usage in their dashboards
- Implement caching for repeated queries
- Use batching for bulk operations

## Roadmap

- [ ] Basic upload & parsing
- [ ] Analysis generation
- [ ] Browse interface
- [ ] Search & filtering
- [ ] Semantic search with embeddings
- [ ] User accounts & saved searches
- [ ] Social sharing (verse cards)
- [ ] API for external integrations
- [ ] Multi-language support
- [ ] Comparison tools (compare texts side-by-side)

## License

MIT
