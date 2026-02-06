import Link from "next/link";
import { Container, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui";
import FeatureCard from "@/components/home/FeatureCard";

export default function HomePage() {
  return (
    <div className="home-page">
      <Container>
        <PageHeader
          title="Sanatana Critique"
          description="AI-powered critical analysis of ancient religious texts through modern ethical lenses"
        />
        
        <div className="home-grid">
          <FeatureCard
            title="Upload & Parse"
            description="Upload religious texts and let AI automatically extract chapters and verses"
          >
            <Link href="/upload">
              <Button variant="primary" size="md">
                Upload Text
              </Button>
            </Link>
          </FeatureCard>

          <FeatureCard
            title="Browse Texts"
            description="Explore parsed books, chapters, and verses with critical analysis"
          >
            <Link href="/browse">
              <Button variant="secondary" size="md">
                Browse
              </Button>
            </Link>
          </FeatureCard>

          <FeatureCard
            title="Search & Filter"
            description="Search verses by content, tags, or problematic score"
          >
            <Button variant="outline" size="md" disabled>
              Coming Soon
            </Button>
          </FeatureCard>
        </div>
      </Container>
    </div>
  );
}
