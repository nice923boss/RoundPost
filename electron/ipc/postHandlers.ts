import { z } from 'zod'
import { handle } from './handle.ts'
import { CreatePost, DateText, Id, PostFilters, SearchQuery, UpdatePost } from './schemas.ts'
import {
  addPlatformToPost,
  createPost,
  deletePost,
  getAllPosts,
  getPostById,
  markPublishedByDate,
  removePlatformFromPost,
  searchPosts,
  togglePostPlatformPublished,
  updatePost
} from '../db/repositories/postRepository.ts'

export function registerPostHandlers(): void {
  handle('posts:getAll', z.tuple([PostFilters]), ([filters]) => getAllPosts(filters))
  handle('posts:getById', z.tuple([Id]), ([id]) => getPostById(id) ?? null)
  handle('posts:create', z.tuple([CreatePost]), ([input]) => createPost(input))
  handle('posts:update', z.tuple([Id, UpdatePost]), ([id, changes]) => updatePost(id, changes))
  handle('posts:delete', z.tuple([Id]), ([id]) => deletePost(id))
  handle('posts:search', z.tuple([SearchQuery, PostFilters]), ([query, filters]) => searchPosts(query, filters))
  handle('posts:markPublishedByDate', z.tuple([DateText]), ([date]) => markPublishedByDate(date))

  handle('postPlatforms:togglePublished', z.tuple([Id]), ([id]) => togglePostPlatformPublished(id))
  handle('postPlatforms:add', z.tuple([Id, Id]), ([postId, platformId]) => addPlatformToPost(postId, platformId))
  handle('postPlatforms:remove', z.tuple([Id, Id]), ([postId, platformId]) =>
    removePlatformFromPost(postId, platformId)
  )
}
