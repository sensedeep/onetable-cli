![OneTable](https://www.sensedeep.com/images/ring-short.png?renew)

*One Table to Rule Them All*

# OneTable Migrate CLI

[![npm](https://img.shields.io/npm/v/onetable-cli.svg)](https://www.npmjs.com/package/onetable-cli)
[![npm](https://img.shields.io/npm/l/onetable-cli.svg)](https://www.npmjs.com/package/onetable-cli)

The DynamoDB OneTable Migration CLI is a command line tool for orchestrating DynamoDB migrations when using [DynamoDB OneTable](https://www.npmjs.com/package/dynamodb-onetable) and [OneTable Migrate](https://www.npmjs.com/package/onetable-migrate).

The CLI is ideal for development teams to initialize and reset database contents and for production use to control and sequence step-wise database upgrades and downgrades. It is a vital tool to successfully evolve your Single-Table DynamoDB patterns.

The OneTable CLI was used in production by the [SenseDeep Developer Studio](https://www.sensedeep.com/) for all DynamoDB access for a year before it was published as an NPM module.

## OneTable Migrate CLI Features

* Easy command line utility to control and manage DynamoDB schema and contents.
* Mutates database schema and contents via discrete, reversible migrations.
* Migrate upwards, downwards, to specific versions.
* Automated, ordered sequencing of migrations in both directions.
* Operates on local databases, remote databases via AWS credentials and via a Lambda proxy.
* Add and remove seed data in any migration.
* Quick reset of DynamoDB databases for development.
* Show database status and list applied migrations.
* Show outstanding migrations.
* Stored history of migrations.
* Minimal dependencies.

## Installation

NOTE: this package requires NPM version 7.0 or later. The version 6.x of NPM that comes with Node v14 will not work as it does not support local packages.

```sh
npm i onetable-cli -g
```

## Remote and Local Operation

OneTable migrations can be executed locally for simple tasks, however it is best to host your migrations close to the DynamoDB table for maximum performance. When executing locally, the migration scripts reside on your local computer and DynamoDB operations are performed from your system. When executing remotely, the migration scripts reside in your AWS account region and DynamoDB operations are performed there, in close proximity to the DynamoDB table.

The OneTable CLI uses the [OneTable Migrate](https://www.npmjs.com/package/onetable-migrate) controller library internally to manage migrations and you should generally host migrations and execute in the same AWS region and availability zone as your DynamoDB table. This will accelerate migrations by minimizing the I/O transfer time.

The easiest way to remotely host the OneTable Migrate library is by deploying the [OneTable Controller](https://github.com/sensedeep/onetable-controller) which is a complete solution for remotely hosting the migrate library.

See [OneTable Controller](https://github.com/sensedeep/onetable-controller) and [OneTable Migrate](https://www.npmjs.com/package/onetable-migrate) for more details about Lambda hosting of the OneTable Migrate library.


## Getting Started

To get started using local migrations without the OneTable Controller, create a directory for your migrations in your project.

```sh
mkdir ./migrations
```

Then create a `migrate.json` with your DynamoDB OneTable configuration. We use JSON5 so you can use Javascript object literal syntax.

```javascript
{
    onetable: {
        name: 'your-dynamo-table',
        //  Other onetable configuration parameters.
    }
}
```

Set the `name` property to the name of your DynamoDB table.

If you need to have your migrations in a different directory, you can set the migrate.json `dir` property to point to the directory containing the migrations themselves.

You pass your OneTable configuration via the `onetable` collection. Ensure your `crypto`, `delimiter`, `nulls` and `typeField` settings match your deployed code. If you have these set to non-default settings in your code, add them to your migrate.json `onetable` map to match.

Generate a stub migration

Migrations are Javascript files that export the methods `up` and `down` to apply the migration and a `description` property. The migration must nominate a version and provide the OneTable schema that applies for the table data at this version level.

```sh
cd ./migrations
onetable generate migration
```

This will create a `0.0.1.js` migration that contains the following. Edit the `up` and `down` methods and description to suit.

The `db` property is the OneTable `Table` instance. This `migrate` property is an instance of the CLI Migrate class.

```javascript
export default {
    version: '0.0.1',
    description: 'Purpose of this migration',
    schema: Schema,
    async up(db, migrate, params) {
        if (!params.dry) {
            await db.create('Model', {})
        } else {
            console.log('Dry run: create "Model"')
        }
    },
    async down(db, migrate, params) {
        if (!params.dry) {
            await db.remove('Model', {})
        } else {
            console.log('Dry run: remove "Model"')
        }
    }
}
```

### Examples

Apply the next migration.

```sh
onetable up
```

Reverse the last migration.

```sh
onetable down
```

Repeat the last migration.

```sh
onetable repeat
```

Migrate to a specific version (up or down).

```sh
onetable 0.1.3
```

Apply all outstanding migrations.

```sh
onetable all
```

Show the last applied migration.

```sh
onetable status
```

Show applied migrations.

```sh
onetable list
```

Show outstanding migrations not yet applied.

```sh
onetable outstanding
```

Reset the database to the latest migration. This should reset the database and apply the `latest.js` migration. The purpose of the `latest` migration is to have one migration that can quickly create a new database with the latest schema without having to apply all historical migrations.

```sh
onetable reset
```

Generate a specific version migration.

```sh
onetable --bump 2.4.3 generate
```

Do a dry run for a migration and not execute. This will set params.dry to true when invoking the up/down.
It is up to the up/down routines to implement the dry run functionality if that support is desired.

```sh
onetable --dry up
```

### Command Line Options

```
--aws-access-key                    # AWS access key
--aws-region                        # AWS service region
--aws-secret-key                    # AWS secret key
--bump [major,minor,patch]          # Version digit to bump in generation
--config ./migrate.json             # Migration configuration
--crypto cipher:password            # Crypto to use for encrypted attributes
--dir directory                     # Change to directory to execute
--dry                               # Dry-run, don't execute
--endpoint http://host:port         # Database endpoint
--force                             # Force action without confirmation
--profile prod|qa|dev|...           # Select configuration profile
--quiet                             # Run as quietly as possible
--version                           # Emit version number
```

### Accessing AWS

You can configure access to your DynamoDB table in your AWS account several ways:

* via command line options
* via the migrate.json
* via environment variables
* via proxy

Via command line option:

```
onetable --aws-access-key key --aws-secret-key secret --aws-region us-east-1
```

Via migrate.json
```
{
    aws: {
        accessKeyId: 'your-key',
        secretAccessKey: 'your-access',
        region: 'us-east-1'
    }
}
```

Or via environment variables:

```
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
```

You can also use:
```
export AWS_PROFILE=aws-profile-name
export AWS_REGION=us-east-1
```

To access a local DynamoDB database, set the migrate.json `aws.endpoint` property to point to the listening endpoint.

```
{
    aws: {
        endpoint: 'http://localhost:8000'
    }
}
```

To communicate with a Lambda hosting the [OneTable Migrate Library](), set the `arn` field to the ARN of your Lambda function.
Then define your AWS credentials as described above to grant access for the CLI to your Lambda.

```
{
    arn: 'arn:aws:lambda:us-east-1:123456789012:function:migrate-prod-invoke'
}
```


### Remote Connections

The ideal configuration for the CLI is to host the OneTable Migrate library in the same AWS region and availability zone as your DynamoDB table. This will accelerate migrations by minimizing the I/O transfer time.

To remotely host the OneTable Migrate library, deploy the [OneTable Controller](https://github.com/sensedeep/onetable-controller) to your desired AWS account and region.

When deployed, configure migrations by setting the CLI migrate.json `arn` property to the ARN of your migration Lambda that hosts the Migration Library.


### Latest Migration

You can create a special `latest` migration that is used for the `migrate reset` command which is is a quick way to get a development database up to the current version.

The latest migration should remove all data from the database and then initialize the database equivalent to applying all migrations.

When creating your `latest.js` migration, be very careful when removing all items from the database. We typically protect this with a test against the deployment profile to ensure you never do this on a production database.

Sample latest.js migration:

```javascript
export default {
    version: '0.0.1',
    description: 'Database reset to latest version',
    schema: Schema,
    async up(db, migrate, params) {
        if (migrate.params.profile == 'dev') {
            await removeAllItems(db)
        }
        //  Provision required database data
    },
    async down(db, migrate, params) {
        if (migrate.params.profile == 'dev') {
            await removeAllItems(db)
        }
    },
}
async function removeAllItems(db) {
    do {
        items = await db.scanItems({}, {limit: 100})
        for (let item of items) {
            await db.deleteItem(item)
        }
    } while (items.length)
}
```

### Profiles

You can use profiles in your `migrate.json` to have specific configuration for different build profiles.

Profiles are implemented by copying the properties from the relevant `profile.NAME` collection to the top level. For example:

Here is a sample migrate.json with profiles:

```javascript
{
    profiles: {
        dev: {
            dir: './migrations',
            name: 'sensedb',
            endpoint: 'http://localhost:8000'
        },
        qa: {
            name: 'sensedb',
            arn: 'arn:aws:lambda:us-east-1:xxxx:function:migrate-qa-invoke'
        },
        prod: {
            name: 'sensedb',
            arn: 'arn:aws:lambda:us-east-1:xxxx:function:migrate-prod-invoke'
        }
    }
}
```

If the profile is set to 'dev', the dev profile properties of `dir`, `name`, and `endpoint` are copied to the root level.

### References

- [OneTable NPM](https://www.npmjs.com/package/dynamodb-onetable)
- [OneTable GitHub](https://github.com/sensedeep/dynamodb-onetable)
- [OneTable Controller](https://www.npmjs.com/package/onetable-controller)
- [OneTable Migrate Library](https://www.npmjs.com/package/onetable-migrate)
- [OneTable Post](https://www.sensedeep.com/blog/posts/2020/dynamodb-onetable.html)
- [DocumentClient SDK Reference](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html)

### Participate

All feedback, contributions and bug reports are very welcome.

* [OneTable CLI Issues](https://github.com/sensedeep/onetable-cli/issues)

### Contact

You can contact me (Michael O'Brien) on Twitter at: [@SenseDeepCloud](https://twitter.com/SenseDeepCloud), or [email](mob-pub-18@sensedeep.com) and ready my [Blog](https://www.sensedeep.com/blog).

### SenseDeep

Please try our Serverless trouble shooter [SenseDeep](https://www.sensedeep.com/).
