// Runs tsc on both projects and fails if either reports an error.
import { spawnSync } from 'node:child_process'

let failed = false

for (const project of ['tsconfig.node.json', 'tsconfig.web.json']) {
  const result = spawnSync('npx', ['tsc', '--noEmit', '-p', project], { encoding: 'utf8', shell: true })
  const errors = `${result.stdout}${result.stderr}`.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (errors.length > 0) {
    failed = true
    process.stderr.write(`${project}\n${errors.join('\n')}\n`)
  } else if (result.status !== 0) {
    failed = true
    process.stderr.write(`${project}：tsc 結束碼 ${result.status}\n`)
  }
}

process.exit(failed ? 1 : 0)
