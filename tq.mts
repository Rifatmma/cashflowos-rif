// The photo path, server side, with a real image: does it read, cost and log?
import { readFileSync } from 'node:fs'
import { readMeal } from './lib/meal-vision'
import { costFromMenu } from './lib/meals'
const path = process.argv[2]
const bytes = readFileSync(path)
console.log('file', path, (bytes.length / 1024).toFixed(0), 'KB')
const read = await readMeal(bytes.toString('base64'), 'image/jpeg')
console.log('is_food:', read.is_food, '|', read.title, read.kcal, '|', read.portion)
console.log('lines:', JSON.stringify(read.lines))
if (read.is_food) console.log('menu match:', JSON.stringify(await costFromMenu(read.title)))
