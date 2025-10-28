import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@repo/design-system/components/ui/breadcrumb';
import { Separator } from '@repo/design-system/components/ui/separator';
import { SidebarTrigger } from '@repo/design-system/components/ui/sidebar';
import { Fragment, type ReactNode } from 'react';

type HeaderProps = {
  pages: string[];
  page: string;
  children?: ReactNode;
};

export const Header = ({ pages, page, children }: HeaderProps) => (
  <header
    className="
      sticky top-0 z-10 
      bg-transparent backdrop-blur-md 
      border-b border-white/10
    "
  >
    <div className="flex items-center gap-2 px-4 py-2">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {pages.map((p, index) => (
            <Fragment key={p}>
              {index > 0 && <BreadcrumbSeparator className="hidden md:block" />}
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#">{p}</BreadcrumbLink>
              </BreadcrumbItem>
            </Fragment>
          ))}
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{page}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
    {children}
  </header>
);
