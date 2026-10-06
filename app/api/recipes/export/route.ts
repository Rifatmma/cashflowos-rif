import { NextResponse } from 'next/server'
import { buildWorklist, getIngredients } from '@/lib/dish-recipes-data'
import { recipeDoc } from '@/lib/recipe-doc'
import { mytDate } from '@/lib/period'

// The recipe book, downloaded as Markdown.
//
// Vercel's filesystem is read-only at runtime, so the app cannot write
// docs/RECIPES.md itself. This route renders exactly the same text on demand,
// so the owner never has to wait for me to be in a session to get the file.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const days = 90
  const [{ rows, groups }, ingredients] = await Promise.all([
    buildWorklist(days), getIngredients(),
  ])
  const md = recipeDoc({ rows, groups, ingredients, days, generated: mytDate() })
  return new NextResponse(md, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="RECIPES-${mytDate()}.md"`,
      'cache-control': 'no-store',
    },
  })
}
