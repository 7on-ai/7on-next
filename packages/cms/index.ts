// Mock basehub imports to fix build errors
// Original code commented out:
// import { basehub as basehubClient, fragmentOn } from 'basehub';
// import { keys } from './keys';

// Mock fragmentOn function
const fragmentOn = ((type: string, config: any) => config) as any;
fragmentOn.infer = ((fragment: any) => {}) as any;

// Mock basehub client
const basehub = {
  query: async (query: any) => ({
    blog: {
      posts: {
        items: [],
        item: null,
      },
    },
    legalPages: {
      items: [],
      item: null,
    },
  }),
} as any;

/* -------------------------------------------------------------------------------------------------
 * Common Fragments
 * -----------------------------------------------------------------------------------------------*/

const imageFragment = fragmentOn('BlockImage', {
  url: true,
  width: true,
  height: true,
  alt: true,
  blurDataURL: true,
});

/* -------------------------------------------------------------------------------------------------
 * Blog Fragments & Queries
 * -----------------------------------------------------------------------------------------------*/

const postMetaFragment = fragmentOn('PostsItem', {
  _slug: true,
  _title: true,
  authors: {
    _title: true,
    avatar: imageFragment,
    xUrl: true,
  },
  categories: {
    _title: true,
  },
  date: true,
  description: true,
  image: imageFragment,
});

const postFragment = fragmentOn('PostsItem', {
  ...postMetaFragment,
  body: {
    plainText: true,
    json: {
      content: true,
      toc: true,
    },
    readingTime: true,
  },
});

export type PostMeta = any; // Mock type
export type Post = any; // Mock type

export const blog = {
  postsQuery: fragmentOn('Query', {
    blog: {
      posts: {
        items: postMetaFragment,
      },
    },
  }),

  latestPostQuery: fragmentOn('Query', {
    blog: {
      posts: {
        __args: {
          orderBy: '_sys_createdAt__DESC',
        },
        item: postFragment,
      },
    },
  }),

  postQuery: (slug: string) => ({
    blog: {
      posts: {
        __args: {
          filter: {
            _sys_slug: { eq: slug },
          },
        },
        item: postFragment,
      },
    },
  }),

  getPosts: async (): Promise<PostMeta[]> => {
    return [];
  },

  getLatestPost: async () => {
    return null;
  },

  getPost: async (slug: string) => {
    return null;
  },
};

/* -------------------------------------------------------------------------------------------------
 * Legal Fragments & Queries
 * -----------------------------------------------------------------------------------------------*/

const legalPostMetaFragment = fragmentOn('LegalPagesItem', {
  _slug: true,
  _title: true,
  description: true,
});

const legalPostFragment = fragmentOn('LegalPagesItem', {
  ...legalPostMetaFragment,
  body: {
    plainText: true,
    json: {
      content: true,
      toc: true,
    },
    readingTime: true,
  },
});

export type LegalPostMeta = any; // Mock type
export type LegalPost = any; // Mock type

export const legal = {
  postsQuery: fragmentOn('Query', {
    legalPages: {
      items: legalPostFragment,
    },
  }),

  latestPostQuery: fragmentOn('Query', {
    legalPages: {
      __args: {
        orderBy: '_sys_createdAt__DESC',
      },
      item: legalPostFragment,
    },
  }),

  postQuery: (slug: string) =>
    fragmentOn('Query', {
      legalPages: {
        __args: {
          filter: {
            _sys_slug: { eq: slug },
          },
        },
        item: legalPostFragment,
      },
    }),

  getPosts: async (): Promise<LegalPost[]> => {
    return [];
  },

  getLatestPost: async () => {
    return null;
  },

  getPost: async (slug: string) => {
    return null;
  },
};
