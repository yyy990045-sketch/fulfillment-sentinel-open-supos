import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { ArrowRight, Menu } from "lucide-react";
import { Button } from "../../../components/ui/button.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../../../components/ui/sheet.js";
import { cn } from "../../../lib/utils.js";
import { useProduct } from './product-state.js';
import { ReviewRail } from './review-evidence.js';

export const navigation = [
  { id: "workbench", label: "履约工作台", path: "/" },
  { id: "runtime", label: "open supOS 运行", path: "/runtime" },
  { id: "validation", label: "验证中心", path: "/validation" },
];
export function Mark() {
  return <span aria-hidden="true" className="inline-flex size-8 items-center justify-center gap-1 rounded-lg bg-primary"><i className="h-3 w-[3px] rounded bg-white/85" /><i className="h-5 w-[3px] rounded bg-white/85" /><i className="h-4 w-[3px] rounded bg-white/85" /></span>;
}
export function ProductShell({ page, children }: { page: string; children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const { review, setReview, setReviewStep } = useProduct();
  const [params] = useSearchParams();
  // Review Mode 深链（?review=ai / ?review=loop / ?review=1）必须生效，否则证据索引跳转会静默失效
  const deepReview = params.get('review');
  const deepStep = params.get('step');
  useEffect(() => {
    if (deepReview === null) return;
    setReview(true);
    const index = deepReview === 'ai' ? 2 : deepReview === 'loop' ? 3 : deepStep !== null ? Number(deepStep) : 0;
    if (Number.isInteger(index) && index >= 0 && index <= 3) setReviewStep(index);
  }, [deepReview, deepStep, setReview, setReviewStep]);
  return <MotionConfig reducedMotion="user"><div className={cn('min-h-dvh', review && 'review-mode')}>
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="product-header mx-auto flex h-16 items-center gap-12 sm:h-[72px]">
        <Link to="/" className="flex shrink-0 items-center gap-3"><Mark /><span className="text-base font-semibold tracking-tight sm:text-lg">履约哨兵</span></Link>
        <nav aria-label="产品空间" className="hidden h-full items-stretch gap-8 md:flex">{navigation.map(item => <Link key={item.id} to={item.path} aria-current={page === item.id ? "page" : undefined} className={cn("flex items-center border-b-2 border-transparent px-1 text-sm text-muted-foreground", page === item.id && "border-primary font-semibold text-primary")}>{item.label}</Link>)}</nav>
        <span className="ml-auto flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-success" />模拟演示</span>
        <Button variant={review ? 'secondary' : 'ghost'} size='sm' className='-ml-8 rounded-full text-xs' aria-pressed={review} onClick={() => setReview(!review)}>评审演示</Button>
        <Button variant="ghost" size="icon" aria-label="打开导航" className="md:hidden" onClick={() => setMenu(true)}><Menu /></Button>
      </div>
    </header>
    {review && <ReviewRail />}
    {children}
    <Sheet open={menu} onOpenChange={setMenu}><SheetContent><SheetHeader><SheetTitle>工作空间</SheetTitle><SheetDescription>履约哨兵</SheetDescription></SheetHeader><nav className="flex flex-col gap-3">{navigation.map(item => <Button key={item.id} asChild variant={page === item.id ? "secondary" : "ghost"} className="justify-between" onClick={() => setMenu(false)}><Link to={item.path}>{item.label}<ArrowRight /></Link></Button>)}</nav></SheetContent></Sheet>
  </div></MotionConfig>;
}
