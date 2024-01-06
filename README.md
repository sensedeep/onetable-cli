![OneTable](https://www.sensedeep.com/images/ring-short.png)

*One Table to Rule Them All*

# OneTable Migrate CLI

<!--
[![npm](https://img.shields.io/npm/v/onetable-cli.svg)](https://www.npmjs.com/package/onetable-cli)
[![npm](https://img.shields.io/npm/l/onetable-cli.svg)](https://www.npmjs.com/package/onetable-cli)
-->

The DynamoDB OneTable Migration CLI is a command line tool for orchestrating DynamoDB migrations when using [DynamoDB OneTable](https://www.npmjs.com/package/dynamodb-onetable) and [OneTable Migrate](https://www.npmjs.com/package/onetable-migrate).

The CLI is ideal for development teams to initialize and reset database contents and for production use to control and sequence step-wise database upgrades, downgrades and maintenance tasks. It is a vital tool to successfully evolve your Single-Table DynamoDB patterns.

The OneTable CLI was used in production by the [SenseDeep Developer Studio](https://www.sensedeep.com/) for all DynamoDB access for a year before it was published as an NPM module.

## OneTable Migrate CLI Features

* Easy command line utility to control and manage DynamoDB schema and contents.
* Mutates database schema and contents via discrete, reversible migrations.
* Migrate upwards, downwards, and to specific versions.
* Automated, ordered sequencing of migrations in both directions.
* Named migrations for database maintenance, auditing and other tasks.
* Operates on local databases and remote databases.
* Use AWS credentials or profiles.
* Add and remove seed data in any migration.
* Quick reset of DynamoDB databases for development.
* Show database status and list applied migrations.
* Show outstanding migrations.
* Stored history of migrations.
* Minimal dependencies.

## Installation

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

Then create a `migrate.json5` with your DynamoDB OneTable configuration. We use JSON5 so you can use Javascript object literal syntax.

```javascript
{
    onetable: {
        name: 'your-dynamo-table',
        //  Other onetable configuration parameters.
        partial: true,
    },
    dir: './migrations'
}
```

Set the `name` property to the name of your DynamoDB table and set the `dir` property to point to the directory containing the migrations.

You pass your OneTable configuration via the `onetable` collection. Ensure your `crypto`, `nulls` and `typeField` settings match your deployed code. If you have these set to non-default settings in your code, add them to your migrate.json5 `onetable` map to match.

**Generate a stub migration**

Migrations are Javascript files that export the methods `up` and `down` to apply the migration and a `description` property. The migration must nominate a version and provide the OneTable schema that applies for the table data at this version level.

```sh
onetable generate migration
```

This will create a `0.0.1.js` migration that contains an `up` method to upgrade the database and a `down` method to downgrade to the previous version. Customize the `up` and `down` methods and description to suit.

For example:

```javascript
import Schema from 'your-onetable-schema',
export default {
    version: '0.0.1',
    description: 'Purpose of this migration',
    schema: Schema,
    async up(db, migrate, params) {
        if (!params.dry) {
            //  Code here to upgrade the database
        } else {
            console.log('Dry run: create "Model"')
        }
    },
    async down(db, migrate, params) {
        if (!params.dry) {
            //  Code here to downgrade the database to the prior version
        } else {
            console.log('Dry run: remove "Model"')
        }
    }
}
```

The `db` property is the OneTable `Table` instance. This `migrate` property is an instance of the CLI Migrate class.

### OneTable Comamnds 

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

Run a specific named migration.

```sh
onetable cleanup-orphans
onetable reset
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

Reset the database to the latest version. If you provide a `reset.js` migration, this migrations should reset the database to a known good state. The purpose of the `reset` migration is to have one migration that can quickly initialize a database with the latest data and schema without having to apply all historical migrations.

```sh
onetable reset
```

Generate a specific version migration.

```sh
onetable --bump 2.4.3 generate

# or generate with a bumped minor version number

onetable --bump minor generate
```

Do a dry run for a migration and not execute. This will set params.dry to true when invoking the up/down migration function. It is up to the up/down routines to implement the dry run functionality if that support is desired.  During a dry run, the database migration table will not be updated nor will the current version and schema.

```sh
onetable --dry up
```

### Command Line Options

```
--aws-access-key                    # AWS access key
--aws-region                        # AWS service region
--aws-secret-key                    # AWS secret key
--bump [VERSION|major|minor|patch]  # Version to generate or digit to bump
--config ./migrate.json5            # Migration configuration file
--crypto cipher:password            # Crypto to use for encrypted attributes
--dir directory                     # Change to directory to execute
--dry                               # Dry-run, don't execute
--endpoint http://host:port         # Database endpoint
--force                             # Force action without confirmation
--profile prod|qa|dev|...           # Select configuration profile
--quiet                             # Run as quietly as possible
--table TableName                   # Set the DynamoDB table name
--version                           # Emit version number
```

### Authenticating with DynamoDB

You can configure access to your DynamoDB table in your AWS account several ways:

* via command line options
* via the migrate.json5
* via environment variables

Via command line option:

```shell
onetable --aws-access-key key --aws-secret-key secret --aws-region us-east-1
```

Via migrate.json5:
```javascript
{
    aws: {
        accessKeyId: 'your-key',
        secretAccessKey: 'your-access',
        region: 'us-east-1'
    }
}
```

Or via environment variables:

```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
```

You can also use:
```bash
export AWS_PROFILE=aws-profile-name
export AWS_REGION=us-east-1
```

To access a local DynamoDB database, set the migrate.json5 `aws.endpoint` property to point to the listening endpoint.

```javascript
{
    aws: {
        endpoint: 'http://localhost:8000'
    }
}
```

To communicate with a Lambda hosting the [OneTable Migrate Library](), set the `arn` field to the ARN of your Lambda function. Then define your AWS credentials as described above to grant access for the CLI to your Lambda.

```javascript
{
    arn: 'arn:aws:lambda:us-east-1:123456789012:function:migrate-prod-invoke'
}
```


### Remote Connections

The ideal configuration for the CLI is to host the OneTable Migrate library in the same AWS region and availability zone as your DynamoDB table. This will accelerate migrations by minimizing the I/O transfer time.

To remotely host the OneTable Migrate library, deploy the [OneTable Controller](https://github.com/sensedeep/onetable-controller) to your desired AWS account and region.

When deployed, configure migrations by setting the CLI migrate.json5 `arn` property to the ARN of your migration Lambda that hosts the Migration Library.


### Reset Migration

You can create a special named `reset` migration that is used for the `onetable reset` command which is is a quick way to get a development database up to the current version.

The `reset` migration should remove all data from the database and then initialize the database as required.

When creating your `reset.js` migration, be very careful when removing all items from the database. We typically protect this with a test against the deployment profile to ensure you never do this on a production database.

Sample reset.js migration:

```javascript
import Schema from 'your-onetable-schema.js'
export default {
    version: '0.0.1',
    description: 'Database reset',
    schema: Schema,
    async up(db, migrate, params) {
        //  Careful not to remove all items on a production database!
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

You can use profiles in your `migrate.json5` to have specific configuration for different build profiles.

Profiles are implemented by copying the properties from the relevant `profile.NAME` collection to the top level. For example:

Here is a sample migrate.json5 with profiles:

```javascript
{
    onetable: {
        name: 'sensedb',
        partial: true,
    },
    profiles: {
        dev: {
            dir: './migrations',
            endpoint: 'http://localhost:8000'
        },
        qa: {
            arn: 'arn:aws:lambda:us-east-1:xxxx:function:migrate-qa-invoke'
        },
        prod: {
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
