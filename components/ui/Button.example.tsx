import { Button } from './index';

/**
 * Example usage of the Button component
 * 
 * This demonstrates how to use the refactored Button component
 * with clean, readable CSS classes defined in globals.css
 */

export function ButtonExamples() {
  return (
    <div className="flex flex-col gap-4 p-8">
      {/* Primary buttons */}
      <div className="flex gap-4">
        <Button variant="primary" size="sm">
          Small Primary
        </Button>
        <Button variant="primary" size="md">
          Medium Primary
        </Button>
        <Button variant="primary" size="lg">
          Large Primary
        </Button>
      </div>

      {/* Secondary buttons */}
      <div className="flex gap-4">
        <Button variant="secondary" size="sm">
          Small Secondary
        </Button>
        <Button variant="secondary" size="md">
          Medium Secondary
        </Button>
        <Button variant="secondary" size="lg">
          Large Secondary
        </Button>
      </div>

      {/* Outline buttons */}
      <div className="flex gap-4">
        <Button variant="outline" size="sm">
          Small Outline
        </Button>
        <Button variant="outline" size="md">
          Medium Outline
        </Button>
        <Button variant="outline" size="lg">
          Large Outline
        </Button>
      </div>

      {/* Disabled state */}
      <div className="flex gap-4">
        <Button variant="primary" disabled>
          Disabled Primary
        </Button>
        <Button variant="secondary" disabled>
          Disabled Secondary
        </Button>
        <Button variant="outline" disabled>
          Disabled Outline
        </Button>
      </div>

      {/* Custom styling with additional classes */}
      <div className="flex gap-4">
        <Button variant="primary" className="rounded-full w-40">
          Custom Rounded
        </Button>
        <Button variant="outline" className="rounded-none">
          No Rounded
        </Button>
      </div>
    </div>
  );
}
