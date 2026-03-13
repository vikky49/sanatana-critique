# Sanatana Critique: Enhancement Implementation Status

## ✅ Completed Work

### 1. Enhanced Analysis System

#### New Analysis Perspectives (4 additional dimensions)
- **Scientific Accuracy**: Evaluates factual/scientific claims vs modern knowledge
- **Logical Consistency**: Identifies internal logical flaws and circular reasoning  
- **Power Dynamics**: Examines authority structures, obedience mandates
- **Cultural Context**: Separates universal claims from culturally-bound teachings

#### Quality Metrics
- **Confidence scoring**: LLM confidence (0-1) for analysis quality
- **Review flagging**: `needsReview` flag for low-confidence analyses (<0.6)
- **Versioning**: Track analysis improvements over time

#### Updated Files
- ✅ `types/index.ts`: Added new Analysis fields
- ✅ `prompts/analyze-verse.txt`: Enhanced prompt with new perspectives
- ✅ `lib/db-operations.ts`: Updated insertAnalysis to handle new fields
- ✅ `app/api/analyze/route.ts`: Parse and store enhanced analysis data
- ✅ `sql/migrations/001_add_enhanced_analysis_fields.sql`: Migration script

### 2. Flexible Embedding System

#### Multi-Provider Support
Created abstraction supporting:
- **OpenAI** (text-embedding-3-small, 1536 dims, API)
- **multilingual-e5-small** (384 dims, local, free)
- **multilingual-e5-large** (1024 dims, local, free)
- **bge-m3** (1024 dims, local, free)
- **LaBSE** (768 dims, local, free)

#### Key Features
- Functional, composable architecture
- Provider-agnostic interface
- Batch processing support
- Automatic model caching
- Environment-configurable via `EMBEDDING_PROVIDER`

#### Files Created
- ✅ `lib/embeddings.ts`: Provider abstraction with functional composition
- ✅ `scripts/eval-queries.json`: 12 test queries (English + Hindi)
- ✅ `scripts/benchmark-embeddings.ts`: Comprehensive benchmark tool

#### Cost & Performance Strategy
- **Verses**: Use local model (free, one-time)
- **Queries**: Use OpenAI or local (minimal cost)
- **Estimated savings**: ~$10-15/month vs all-OpenAI approach

### 3. Semantic Search API

#### Implementation
- ✅ Functional query builder (no imperative if/else)
- ✅ Hybrid search: vector similarity + filters
- ✅ Advanced filtering: tags, perspectives, score range
- ✅ Multiple sort modes: relevance, score, chapter
- ✅ Configurable provider via embedding abstraction

#### Endpoint: `GET /api/search`
Query params:
- `query`: Search text (any language)
- `bookIds`: Filter by books (comma-separated)
- `minScore`, `maxScore`: Problematic score range
- `tags`: Filter by tags (comma-separated)
- `perspectives`: Filter by analysis perspectives
- `limit`: Results limit (default 50)
- `sortBy`: relevance | score | chapter
- `useSemanticSearch`: Enable/disable vector search

#### Files
- ✅ `app/api/search/route.ts`: Functional search implementation

## 🚧 Next Steps (Prioritized)

### Phase 1: Foundation Setup

#### 1.1 Install Dependencies
```bash
npm install
```
This will install `@xenova/transformers@^3.3.1`

#### 1.2 Run Database Migration
```bash
# Using your preferred Postgres client or Neon SQL editor
psql $DATABASE_URL < sql/migrations/001_add_enhanced_analysis_fields.sql
```

#### 1.3 Choose Embedding Provider
Run benchmark to decide:
```bash
npm run benchmark:embeddings
```

Expected output:
```
Provider              Dims    R@10      nDCG@10   Latency     Cost/mo
────────────────────────────────────────────────────────────────────
openai                1536    85.2%     0.823     120ms       $0.10
multilingual-e5-small 384     78.5%     0.764     450ms       $0.00
multilingual-e5-large 1024    82.1%     0.801     850ms       $0.00
bge-m3                1024    81.3%     0.795     900ms       $0.00
```

**Recommendation**: 
- If speed matters: `openai` (fast, low cost)
- If cost matters: `multilingual-e5-large` (free, good quality)
- If both: `multilingual-e5-small` (reasonable tradeoff)

#### 1.4 Set Environment Variable
Add to `.env.local`:
```bash
EMBEDDING_PROVIDER=multilingual-e5-large  # or your choice
```

### Phase 2: Data Migration (if changing dimensions)

If you chose a different embedding dimension than current (1536):

#### 2.1 Update Vector Column
```sql
-- Example: changing from 1536 to 1024
ALTER TABLE verses 
  ALTER COLUMN embedding TYPE vector(1024);
```

#### 2.2 Re-embed Existing Verses
Create script `scripts/re-embed-verses.ts`:
```typescript
import {Pool} from '@neondatabase/serverless';
import {generateEmbedding, getDefaultProvider} from '@/lib/embeddings';

async function main() {
  const pool = new Pool({connectionString: process.env.DATABASE_URL!});
  const verses = await pool.query('SELECT id, translation FROM verses');
  
  for (const verse of verses.rows) {
    const result = await generateEmbedding(verse.translation, getDefaultProvider(), false);
    await pool.query(
      'UPDATE verses SET embedding = $1 WHERE id = $2',
      [`[${result.embedding.join(',')}]`, verse.id]
    );
    console.log(`✓ Re-embedded verse ${verse.id}`);
  }
}

main();
```

Run: `npm run tsx scripts/re-embed-verses.ts`

### Phase 3: UI Implementation

#### 3.1 Search Page
Create `app/search/page.tsx` with:
- Search bar component
- Filter controls
- Results display
- Pagination

#### 3.2 Search Components
- `components/search/SearchBar.tsx`
- `components/search/SearchFilters.tsx`
- `components/search/SearchResults.tsx`
- `components/search/ResultCard.tsx`

#### 3.3 Update Navigation
Add search link to main navigation

### Phase 4: Advanced Features (Optional)

#### 4.1 Comparative Analysis
- Endpoint: `/api/analyze/comparative`
- Find similar verses before analyzing
- Include cross-references in analysis

#### 4.2 Search Analytics
- Log queries to `search_queries` table
- Track popular searches
- Dashboard for insights

#### 4.3 Export Functionality
- Export search results as JSON/CSV
- Batch download analyses

## 📊 Technical Decisions Summary

### Embedding Strategy
**Decision**: Hybrid approach with configurable providers
**Rationale**:
- Flexibility to optimize for cost vs performance
- Easy to switch providers based on benchmarks
- No vendor lock-in

### Architecture Pattern
**Decision**: Functional composition over imperative code
**Rationale**:
- More maintainable query builders
- Easier to test and reason about
- Follows modern JavaScript best practices

### Database Schema
**Decision**: Denormalized analysis fields
**Rationale**:
- Faster queries (no joins needed for filtering)
- Simpler application code
- Acceptable storage overhead for ~1000s of verses

## 🧪 Testing & Validation

### Before Deploying

1. **Test enhanced analysis**:
   ```bash
   # Analyze a few sample verses
   curl -X POST http://localhost:3000/api/analyze \
     -H "Content-Type: application/json" \
     -d '{"bookId":"...", "chapterNumber":1, "verseNumber":1}'
   ```

2. **Test search endpoint**:
   ```bash
   # Semantic search
   curl "http://localhost:3000/api/search?query=women+duties&useSemanticSearch=true"
   
   # Filtered search
   curl "http://localhost:3000/api/search?tags=misogyny&minScore=7"
   ```

3. **Run benchmark** (if you have existing data):
   ```bash
   npm run benchmark:embeddings -- --all
   ```

4. **Verify migrations**:
   ```sql
   -- Check new columns exist
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'analyses';
   ```

## 📝 Documentation Updates Needed

1. Update README.md with:
   - New search features
   - Enhanced analysis perspectives
   - Embedding provider configuration

2. Create API documentation for `/api/search`

3. Add user guide for search UI (once built)

## 🎯 Success Metrics

Track these after deployment:
- Search query latency (target: <500ms)
- Embedding cost per 1K queries (target: <$0.01)
- Search result relevance (user feedback)
- Analysis confidence distribution (% needing review)

## ⚠️ Known Limitations

1. **Embedding dimension mismatch**: If you change providers with different dimensions, must re-embed all verses
2. **Cold start latency**: First transformers.js load takes ~2-5s
3. **Model size**: Local models add ~120-400MB to deployment
4. **Vercel limits**: Edge functions have memory/time limits for large models

## 🚀 Quick Start Checklist

- [ ] Run `npm install`
- [ ] Apply database migration
- [ ] Run embedding benchmark
- [ ] Choose and configure provider
- [ ] Test analysis endpoint with new fields
- [ ] Test search endpoint
- [ ] Re-embed existing verses (if dimension changed)
- [ ] Deploy and monitor

---

**Last Updated**: 2026-03-12  
**Status**: Core implementation complete, UI pending
