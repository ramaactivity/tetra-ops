/**
 * <SectionCard /> — operations-cluster section primitive.
 *
 * Alias of the existing <CollapsibleCard> from src/components/ui — same
 * surface, header (icon + title + subtitle + actions), and collapsible
 * chevron. Re-exported here so all operations sub-pages import from a
 * single cluster-scoped entry point (`operations/_shared/`).
 *
 * If you need to evolve the section card shape for operations
 * specifically (e.g. different chevron position, status pill in header),
 * wrap CollapsibleCard here rather than diverging at every callsite.
 */

export { CollapsibleCard as SectionCard } from "@/components/ui/collapsible-card";
